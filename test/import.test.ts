import {describe, expect, it} from "vitest";
import {mergeImported} from "../src/import";
import {defaultSettings, JSPSettings} from "../src/settings";

function settings(overrides: Partial<JSPSettings> = {}): JSPSettings {
    return {...defaultSettings, shared: [], ...overrides};
}

describe("mergeImported", () => {
    it("imports url, shares and boolean settings into empty settings", () => {
        let result = mergeImported(settings(), {
            url: "https://jsp.example.com",
            shared: [{id: "a1", password: "p", path: "A.md"}],
            stripFrontmatter: false,
            includeNoteName: false,
            unshareDeletedFiles: false,
            autoUpdateShares: true
        });
        expect(result.settings.url).toBe("https://jsp.example.com");
        expect(result.settings.shared).toEqual([{id: "a1", password: "p", path: "A.md"}]);
        expect(result.settings.stripFrontmatter).toBe(false);
        expect(result.settings.includeNoteName).toBe(false);
        expect(result.settings.unshareDeletedFiles).toBe(false);
        expect(result.settings.autoUpdateShares).toBe(true);
        expect(result.added).toBe(1);
    });

    it("merges shares and dedupes by id, keeping existing entries", () => {
        let current = settings({shared: [{id: "a1", password: "mine", path: "Renamed.md"}]});
        let result = mergeImported(current, {
            shared: [
                {id: "a1", password: "old", path: "A.md"},
                {id: "b2", password: "p", path: "B.md"},
                {id: "b2", password: "p", path: "B.md"}
            ]
        });
        expect(result.settings.shared).toEqual([
            {id: "a1", password: "mine", path: "Renamed.md"},
            {id: "b2", password: "p", path: "B.md"}
        ]);
        expect(result.added).toBe(1);
    });

    it("keeps an already configured url", () => {
        let result = mergeImported(settings({url: "https://mine"}), {url: "https://old"});
        expect(result.settings.url).toBe("https://mine");
    });

    it("does not adopt the original public server url", () => {
        let result = mergeImported(settings(), {url: "https://jsp.ellpeck.de"});
        expect(result.settings.url).toBe("");
    });

    it("never touches the token or language", () => {
        let current = settings({token: "secret", language: "fi"});
        let result = mergeImported(current, {token: "x", language: "en"} as never);
        expect(result.settings.token).toBe("secret");
        expect(result.settings.language).toBe("fi");
    });

    it("ignores malformed data", () => {
        let current = settings({shared: [{id: "a1", password: "p", path: "A.md"}]});
        let result = mergeImported(current, {
            url: 42,
            shared: [null, {id: "x"}, {id: 1, password: "p", path: "P.md"}, "nope"],
            stripFrontmatter: "yes"
        } as never);
        expect(result.settings.url).toBe(current.url);
        expect(result.settings.shared).toEqual(current.shared);
        expect(result.settings.stripFrontmatter).toBe(current.stripFrontmatter);
        expect(result.added).toBe(0);

        expect(mergeImported(current, null).settings).toEqual(current);
        expect(mergeImported(current, "garbage" as never).settings).toEqual(current);
    });

    it("does not mutate its inputs", () => {
        let current = settings({shared: [{id: "a1", password: "p", path: "A.md"}]});
        let imported = {shared: [{id: "b2", password: "p", path: "B.md"}]};
        mergeImported(current, imported);
        expect(current.shared).toHaveLength(1);
        expect(imported.shared).toHaveLength(1);
    });
});
