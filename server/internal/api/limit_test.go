package api

import (
	"fmt"
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
		l.charge("a")
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

func TestLimiterIsBounded(t *testing.T) {
	now := time.Unix(0, 0)
	l := newLimiter(1, time.Minute, func() time.Time { return now })
	l.max = 100
	for i := range 1000 {
		now = now.Add(time.Millisecond)
		l.charge(fmt.Sprint("busy", i)) // all empty, none refilled
		if len(l.clients) > l.max {
			t.Fatalf("tracked %d clients, max %d", len(l.clients), l.max)
		}
	}
	if !l.blocked("busy999") {
		t.Error("newest client evicted")
	}
	if _, ok := l.clients["busy0"]; ok {
		t.Error("oldest client kept")
	}
}

func TestLimiterEvictsRefilledFirst(t *testing.T) {
	now := time.Unix(0, 0)
	l := newLimiter(1, time.Minute, func() time.Time { return now })
	l.max = 10
	l.charge("idle") // refilled after a minute, oldest
	now = now.Add(2 * time.Minute)
	for i := range 9 {
		l.charge(fmt.Sprint("busy", i))
	}
	l.charge("new")
	if _, ok := l.clients["idle"]; ok {
		t.Error("refilled client kept")
	}
	for i := range 9 {
		if !l.blocked(fmt.Sprint("busy", i)) {
			t.Errorf("busy%d evicted before a refilled client", i)
		}
	}
}

func TestLimitKey(t *testing.T) {
	cases := map[string]string{
		"203.0.113.5":                "203.0.113.5",
		"2001:db8:1:2:aaaa::1":       "2001:db8:1:2::/64",
		"2001:db8:1:2:ffff:ffff::99": "2001:db8:1:2::/64",
		"::ffff:203.0.113.5":         "203.0.113.5",
		"not-an-ip":                  "not-an-ip",
	}
	for in, want := range cases {
		if got := limitKey(in); got != want {
			t.Errorf("limitKey(%q) = %q, want %q", in, got, want)
		}
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
