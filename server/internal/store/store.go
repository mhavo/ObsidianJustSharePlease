// Package store keeps shares on disk as <id>.md (content) and <id>.json (meta).
package store

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrUnauthorized = errors.New("unauthorized")
	ErrInvalidID    = errors.New("invalid id")
)

var idPattern = regexp.MustCompile(`^[A-Za-z0-9]{8,64}$`)

// ValidID reports whether id is safe to use as a file name stem.
func ValidID(id string) bool { return idPattern.MatchString(id) }

// MetaVersion is the schema version written by this server.
const MetaVersion = 2

// Meta is the on-disk metadata of a share. Version 1 (PHP) files only have
// id, password (plaintext) and created; they are migrated on successful auth.
type Meta struct {
	Version        int    `json:"version"`
	ID             string `json:"id"`
	PasswordSHA256 string `json:"password_sha256,omitempty"`
	LegacyPassword string `json:"password,omitempty"`
	Created        int64  `json:"created"`
	Updated        int64  `json:"updated,omitempty"`
	Expires        *int64 `json:"expires"`
	Encrypted      bool   `json:"encrypted"`
}

// Share is returned once on creation; Password is never stored in plaintext.
type Share struct {
	ID       string `json:"id"`
	Password string `json:"password"`
	Created  int64  `json:"created"`
}

type Store struct {
	dir   string
	locks [256]sync.Mutex
	now   func() time.Time
}

// New opens (and creates, mode 0700) the data directory.
func New(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &Store{dir: dir, now: time.Now}, nil
}

func (s *Store) lock(id string) func() {
	h := fnv.New32a()
	h.Write([]byte(id))
	m := &s.locks[h.Sum32()%uint32(len(s.locks))]
	m.Lock()
	return m.Unlock
}

func (s *Store) contentPath(id string) string { return filepath.Join(s.dir, id+".md") }
func (s *Store) metaPath(id string) string    { return filepath.Join(s.dir, id+".json") }

func (s *Store) Content(id string) ([]byte, error) {
	if !ValidID(id) {
		return nil, ErrInvalidID
	}
	b, err := os.ReadFile(s.contentPath(id))
	return b, notFound(err)
}

func (s *Store) Meta(id string) (Meta, error) {
	if !ValidID(id) {
		return Meta{}, ErrInvalidID
	}
	return s.readMeta(id)
}

func (s *Store) readMeta(id string) (Meta, error) {
	b, err := os.ReadFile(s.metaPath(id))
	if err != nil {
		return Meta{}, notFound(err)
	}
	var m Meta
	if err := json.Unmarshal(b, &m); err != nil {
		return Meta{}, fmt.Errorf("meta %s: %w", id, err)
	}
	m.ID = id // the validated file name is authoritative, never the file content
	return m, nil
}

func (s *Store) Create(content string) (Share, error) {
	password := randomHex(16)
	for {
		id := randomHex(12)
		unlock := s.lock(id)
		if _, err := os.Stat(s.metaPath(id)); !errors.Is(err, fs.ErrNotExist) {
			unlock()
			if err != nil {
				return Share{}, err
			}
			continue // collision, practically impossible
		}
		now := s.now().Unix()
		m := Meta{ID: id, PasswordSHA256: hashPassword(password), Created: now, Updated: now}
		err := s.writeContent(id, content)
		if err == nil {
			err = s.writeMeta(id, m)
		}
		unlock()
		if err != nil {
			return Share{}, err
		}
		return Share{ID: id, Password: password, Created: now}, nil
	}
}

func (s *Store) Update(id, password, content string) error {
	if !ValidID(id) {
		return ErrInvalidID
	}
	defer s.lock(id)()
	m, err := s.authorize(id, password)
	if err != nil {
		return err
	}
	if err := s.writeContent(id, content); err != nil {
		return err
	}
	m.Updated = s.now().Unix()
	return s.writeMeta(id, m)
}

func (s *Store) Delete(id, password string) error {
	if !ValidID(id) {
		return ErrInvalidID
	}
	defer s.lock(id)()
	if _, err := s.authorize(id, password); err != nil {
		return err
	}
	// Content first: a crash in between leaves an orphan meta, not a readable share.
	if err := os.Remove(s.contentPath(id)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return os.Remove(s.metaPath(id))
}

// authorize checks password and returns the meta upgraded to the current
// schema. Callers that write the meta back complete the lazy migration.
func (s *Store) authorize(id, password string) (Meta, error) {
	m, err := s.readMeta(id)
	if err != nil {
		return Meta{}, err
	}
	switch {
	case m.PasswordSHA256 != "":
		want, err := hex.DecodeString(m.PasswordSHA256)
		got := sha256.Sum256([]byte(password))
		if err != nil || subtle.ConstantTimeCompare(want, got[:]) != 1 {
			return Meta{}, ErrUnauthorized
		}
	case m.LegacyPassword != "":
		if subtle.ConstantTimeCompare([]byte(m.LegacyPassword), []byte(password)) != 1 {
			return Meta{}, ErrUnauthorized
		}
		m.PasswordSHA256 = hashPassword(password)
		m.LegacyPassword = ""
	default:
		return Meta{}, ErrUnauthorized
	}
	return m, nil
}

func (s *Store) writeContent(id, content string) error {
	return writeAtomic(s.contentPath(id), []byte(content))
}

// writeMeta stores m under the already validated id.
func (s *Store) writeMeta(id string, m Meta) error {
	m.Version = MetaVersion
	m.ID = id
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return writeAtomic(s.metaPath(id), b)
}

// writeAtomic writes via a temp file in the same directory, fsyncs it and
// renames it over path, so readers see either the old or the new file.
func writeAtomic(path string, data []byte) (err error) {
	dir := filepath.Dir(path)
	f, err := os.CreateTemp(dir, ".tmp-*") // mode 0600; dot prefix never matches an ID
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			f.Close()
			os.Remove(f.Name())
		}
	}()
	if _, err = f.Write(data); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), path); err != nil {
		return err
	}
	if d, derr := os.Open(dir); derr == nil {
		d.Sync()
		d.Close()
	}
	return nil
}

func notFound(err error) error {
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNotFound
	}
	return err
}

func hashPassword(p string) string {
	sum := sha256.Sum256([]byte(p))
	return hex.EncodeToString(sum[:])
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b) // never returns an error since Go 1.24
	return hex.EncodeToString(b)
}
