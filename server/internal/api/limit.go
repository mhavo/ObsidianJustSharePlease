package api

import (
	"maps"
	"net"
	"net/http"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"time"
)

const maxTrackedClients = 10000

// limiter is a per-client token bucket. Callers charge it for events they
// want to limit (failed auth, anonymous creates); a client is blocked while
// its bucket is empty. The number of tracked clients is bounded.
type limiter struct {
	mu      sync.Mutex
	burst   float64
	rate    float64 // tokens per second
	max     int
	now     func() time.Time
	clients map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(burst int, per time.Duration, now func() time.Time) *limiter {
	return &limiter{
		burst:   float64(burst),
		rate:    float64(burst) / per.Seconds(),
		max:     maxTrackedClients,
		now:     now,
		clients: make(map[string]*bucket),
	}
}

// level is the bucket's token count at now.
func (l *limiter) level(b *bucket, now time.Time) float64 {
	return min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
}

func (l *limiter) blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.clients[key]
	return b != nil && l.level(b, l.now()) < 1
}

func (l *limiter) charge(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b := l.clients[key]
	if b == nil {
		if len(l.clients) >= l.max {
			l.evict(now)
		}
		b = &bucket{tokens: l.burst, last: now}
		l.clients[key] = b
	}
	b.tokens = max(0, l.level(b, now)-1)
	b.last = now
}

// evict shrinks the map to 90% of max: refilled buckets go first, then the
// least recently charged. Freeing 10% at a time amortizes the O(n log n) cost.
func (l *limiter) evict(now time.Time) {
	target := min(l.max-1, l.max*9/10)
	for k, b := range l.clients {
		if l.level(b, now) >= l.burst {
			delete(l.clients, k)
		}
	}
	if len(l.clients) <= target {
		return
	}
	keys := slices.Collect(maps.Keys(l.clients))
	slices.SortFunc(keys, func(a, b string) int { return l.clients[a].last.Compare(l.clients[b].last) })
	for _, k := range keys[:len(keys)-target] {
		delete(l.clients, k)
	}
}

// limitKey groups IPv6 clients by /64, since one host usually owns a whole /64.
func limitKey(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	addr = addr.Unmap()
	if addr.Is4() {
		return addr.String()
	}
	return netip.PrefixFrom(addr, 64).Masked().String()
}

// clientIP returns the peer address, or, when the peer is a trusted proxy,
// the rightmost untrusted address of X-Forwarded-For.
func clientIP(r *http.Request, trusted []netip.Prefix) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil || !isTrusted(peer, trusted) {
		return host
	}
	hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	ip := peer
	for i := len(hops) - 1; i >= 0; i-- {
		hop, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			break
		}
		ip = hop
		if !isTrusted(hop, trusted) {
			break
		}
	}
	return ip.Unmap().String()
}

func isTrusted(ip netip.Addr, trusted []netip.Prefix) bool {
	ip = ip.Unmap()
	for _, p := range trusted {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}
