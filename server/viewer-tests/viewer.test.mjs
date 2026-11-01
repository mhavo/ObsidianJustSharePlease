// Unit tests for the viewer's pure logic (server/public/viewer-lib.js and i18n.js).
// Run with: node --test server/viewer-tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../public/viewer-lib.js");
const i18n = require("../public/i18n.js");

test("getIdFromHash returns undefined for an empty hash", () => {
    assert.equal(lib.getIdFromHash(""), undefined);
    assert.equal(lib.getIdFromHash(undefined), undefined);
});

test("getIdFromHash reads up to the first dash", () => {
    assert.equal(lib.getIdFromHash("#abc123XY"), "abc123XY");
    assert.equal(lib.getIdFromHash("#abc123XY-some-heading"), "abc123XY");
    assert.equal(lib.getIdFromHash("#-heading-on-home"), "");
    assert.equal(lib.getIdFromHash("#"), "");
});

test("classifyId distinguishes home, valid and invalid ids", () => {
    assert.equal(lib.classifyId(undefined), "home");
    assert.equal(lib.classifyId(""), "home");
    assert.equal(lib.classifyId("abcd1234"), "valid");
    assert.equal(lib.classifyId("A".repeat(64)), "valid");
    assert.equal(lib.classifyId("abc1234"), "invalid");
    assert.equal(lib.classifyId("A".repeat(65)), "invalid");
    assert.equal(lib.classifyId("<img src=x onerror=alert(1)>"), "invalid");
    assert.equal(lib.classifyId("abcd1234%3Cb%3E"), "invalid");
    assert.equal(lib.classifyId("abcd_1234"), "invalid");
    assert.equal(lib.classifyId("abcd1234\n"), "invalid");
});

test("escapeHtml escapes all HTML metacharacters", () => {
    assert.equal(lib.escapeHtml(`<a href="x" title='y'>&</a>`),
        "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    assert.equal(lib.escapeHtml(42), "42");
    assert.equal(lib.escapeHtml(null), "");
});

test("formatParts splits a template into text and parameter parts", () => {
    assert.deepEqual(lib.formatParts("Error {id}: {details}!", { id: "x", details: "<b>" }), [
        { type: "text", value: "Error " },
        { type: "param", name: "id", value: "x" },
        { type: "text", value: ": " },
        { type: "param", name: "details", value: "<b>" },
        { type: "text", value: "!" }
    ]);
    assert.deepEqual(lib.formatParts("{a}", { a: "1" }), [{ type: "param", name: "a", value: "1" }]);
    assert.deepEqual(lib.formatParts("plain", {}), [{ type: "text", value: "plain" }]);
    // unknown placeholders are kept as literal text
    assert.deepEqual(lib.formatParts("x {nope}", {}), [{ type: "text", value: "x {nope}" }]);
});

test("resolveLanguage prefers a stored supported choice", () => {
    assert.equal(i18n.resolveLanguage("en", "fi-FI"), "en");
    assert.equal(i18n.resolveLanguage("fi", "en-US"), "fi");
});

test("resolveLanguage falls back to navigator.language", () => {
    assert.equal(i18n.resolveLanguage(null, "fi-FI"), "fi");
    assert.equal(i18n.resolveLanguage(null, "fi"), "fi");
    assert.equal(i18n.resolveLanguage(null, "FI"), "fi");
    assert.equal(i18n.resolveLanguage(undefined, "en-GB"), "en");
    assert.equal(i18n.resolveLanguage("de", "sv-SE"), "en");
    assert.equal(i18n.resolveLanguage("constructor", undefined), "en");
    assert.equal(i18n.resolveLanguage(null, ""), "en");
});

test("every language defines the same keys", () => {
    const en = Object.keys(i18n.translations.en).sort();
    for (const lang of i18n.languages)
        assert.deepEqual(Object.keys(i18n.translations[lang]).sort(), en, lang);
    assert.deepEqual([...i18n.languages].sort(), ["en", "fi"]);
});

test("translate looks up a key and falls back to English, then the key", () => {
    assert.equal(i18n.translate("fi", "home"), "Etusivu");
    assert.equal(i18n.translate("en", "home"), "Home");
    assert.equal(i18n.translate("xx", "home"), "Home");
    assert.equal(i18n.translate("fi", "noSuchKey"), "noSuchKey");
});
