package api

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

const maxTrackedClients = 10000

// limiter is a per-client token bucket that only counts failed write
// attempts. A client is blocked while its bucket is empty.
type limiter struct {
	mu      sync.Mutex
	burst   float64
	rate    float64 // tokens per second
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
		now:     now,
		clients: make(map[string]*bucket),
	}
}

// refill returns the client's bucket topped up to now, or nil if untracked.
func (l *limiter) refill(key string, now time.Time) *bucket {
	b := l.clients[key]
	if b != nil {
		b.tokens = min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
		b.last = now
	}
	return b
}

func (l *limiter) blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.refill(key, l.now())
	return b != nil && b.tokens < 1
}

func (l *limiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b := l.refill(key, now)
	if b == nil {
		if len(l.clients) >= maxTrackedClients {
			l.prune(now)
		}
		b = &bucket{tokens: l.burst, last: now}
		l.clients[key] = b
	}
	b.tokens = max(0, b.tokens-1)
}

// prune drops clients whose bucket has refilled completely.
func (l *limiter) prune(now time.Time) {
	for k := range l.clients {
		if l.refill(k, now).tokens >= l.burst {
			delete(l.clients, k)
		}
	}
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
