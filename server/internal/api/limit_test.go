package api

import (
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"
)

func TestLimiterBlocksAfterBurstAndRefills(t *testing.T) {
	now := time.Unix(0, 0)
	l := newLimiter(3, time.Minute, func() time.Time { return now })
	for range 3 {
		if l.blocked("a") {
			t.Fatal("blocked too early")
		}
		l.fail("a")
	}
	if !l.blocked("a") {
		t.Fatal("not blocked after burst")
	}
	if l.blocked("b") {
		t.Fatal("other client blocked")
	}
	now = now.Add(20 * time.Second) // one failure refilled
	if l.blocked("a") {
		t.Fatal("not refilled")
	}
}

func TestLimiterForgetsIdleClients(t *testing.T) {
	now := time.Unix(0, 0)
	l := newLimiter(1, time.Minute, func() time.Time { return now })
	for i := range maxTrackedClients + 1 {
		l.fail(string(rune(i)))
	}
	now = now.Add(time.Hour)
	l.fail("new")
	if len(l.clients) > 1 {
		t.Errorf("tracked %d clients, want idle ones pruned", len(l.clients))
	}
}

func TestClientIP(t *testing.T) {
	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	cases := []struct {
		remote, xff, want string
	}{
		{"203.0.113.5:1234", "", "203.0.113.5"},
		{"203.0.113.5:1234", "1.2.3.4", "203.0.113.5"},             // untrusted peer: header ignored
		{"10.0.0.1:1234", "1.2.3.4", "1.2.3.4"},                    // trusted proxy
		{"10.0.0.1:1234", "6.6.6.6, 1.2.3.4, 10.0.0.2", "1.2.3.4"}, // rightmost untrusted hop
		{"10.0.0.1:1234", "10.0.0.3", "10.0.0.3"},                  // all trusted: leftmost
		{"10.0.0.1:1234", "garbage", "10.0.0.1"},
		{"10.0.0.1:1234", "", "10.0.0.1"},
		{"[::1]:80", "", "::1"},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if got := clientIP(r, trusted); got != c.want {
			t.Errorf("clientIP(%s, %q) = %s, want %s", c.remote, c.xff, got, c.want)
		}
	}
}
