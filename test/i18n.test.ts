import {describe, expect, it} from "vitest";
import {resolveLanguage, translate, translations} from "../src/i18n";

describe("resolveLanguage", () => {
    it("uses an explicit setting regardless of Obsidian's language", () => {
        expect(resolveLanguage("fi", "en")).toBe("fi");
        expect(resolveLanguage("en", "fi")).toBe("en");
    });

    it("follows Obsidian's language when set to auto", () => {
        expect(resolveLanguage("auto", "fi")).toBe("fi");
        expect(resolveLanguage("auto", "fi-FI")).toBe("fi");
        expect(resolveLanguage("auto", "FI")).toBe("fi");
        expect(resolveLanguage("auto", "de")).toBe("en");
        expect(resolveLanguage("auto", null)).toBe("en");
        expect(resolveLanguage("auto", "")).toBe("en");
    });

    it("treats unknown setting values as auto", () => {
        expect(resolveLanguage("xx" as never, "fi")).toBe("fi");
        expect(resolveLanguage(undefined, "en")).toBe("en");
    });
});

describe("translate", () => {
    it("returns the string for the requested language", () => {
        expect(translate("en", "settings.token.name")).toBe("Token");
        expect(translate("fi", "settings.token.name")).toBe("Token");
        expect(translate("fi", "view.empty")).not.toBe(translate("en", "view.empty"));
    });

    it("interpolates named parameters", () => {
        expect(translate("en", "notice.shared", {name: "Note"})).toContain("Note");
        expect(translate("fi", "notice.shared", {name: "Muistio"})).toContain("Muistio");
        expect(translate("en", "error.other", {status: 500})).toContain("500");
    });

    it("has every English key in Finnish and nothing extra", () => {
        expect(Object.keys(translations.fi).sort()).toEqual(Object.keys(translations.en).sort());
        for (let value of Object.values(translations.fi))
            expect(value.trim()).not.toBe("");
    });

    it("uses the same placeholders in both languages", () => {
        let placeholders = (s: string) => (s.match(/\{\w+}/g) ?? []).sort();
        for (let key of Object.keys(translations.en) as (keyof typeof translations.en)[])
            expect(placeholders(translations.fi[key]), key).toEqual(placeholders(translations.en[key]));
    });
});
