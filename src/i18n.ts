// Translation tables and language resolution. Must not import "obsidian" so it stays unit-testable.

export type Language = "fi" | "en";
export type LanguageSetting = "auto" | Language;

const en = {
    "command.openView": "Open Just Share Please view",
    "command.share": "Share current file to JSP",
    "command.copy": "Copy current file's JSP link",
    "command.update": "Update current file in JSP",
    "command.delete": "Delete current file from JSP",
    "command.import": "Import shares from Just Share Please",

    "action.share": "Share to JSP",
    "action.copy": "Copy JSP link",
    "action.update": "Update in JSP",
    "action.delete": "Delete from JSP",
    "action.open": "Open in Obsidian",

    "notice.shared": "Successfully shared {name} and copied link to clipboard",
    "notice.updated": "Successfully updated {name} on JSP",
    "notice.deleted": "Successfully deleted {name} from JSP",
    "notice.localDeleted": "Successfully deleted local information for {name}",
    "notice.linkCopied": "Copied link to {name} to clipboard",
    "notice.notConfigured": "Set the server URL and token in the Just Share Please (Self-hosted) settings first.",

    "button.openSettings": "Open settings",
    "button.forceDeleteLocal": "Force-delete local information",
    "button.removeLocal": "Remove local information",

    "error.share": "There was an error sharing {name}:",
    "error.update": "There was an error updating {name}:",
    "error.delete": "There was an error deleting {name}:",
    "error.invalidToken": "Token missing or wrong – check the settings.",
    "error.wrongPassword": "The server rejected the share password.",
    "error.notFound": "The share no longer exists on the server. You can remove its local information.",
    "error.tooLarge": "The note is too large for the server.",
    "error.rateLimited": "Too many failed attempts. Try again later.",
    "error.other": "The server responded with status {status}.",

    "import.offer": "Shares from the original Just Share Please plugin were found.",
    "import.button": "Import shares from Just Share Please",
    "import.done": "Imported settings and {count} new shares from Just Share Please.",
    "import.notFound": "No Just Share Please data was found in this vault.",
    "import.failed": "Importing from Just Share Please failed: {error}",

    "settings.url.name": "Server URL",
    "settings.url.desc": "Address of your self-hosted Just Share Please server, for example https://jsp.example.com.",
    "settings.token.name": "Token",
    "settings.token.desc": "Upload token configured on the server. It is sent when sharing, updating and deleting.",
    "settings.includeProperties.name": "Include file properties",
    "settings.includeProperties.desc": "Whether the file properties of the shared note should be included in the share as visible frontmatter.",
    "settings.includeNoteName.name": "Include note name",
    "settings.includeNoteName.desc": "Whether the name of the shared note should be included in the share as a heading.",
    "settings.unshareDeleted.name": "Unshare deleted files",
    "settings.unshareDeleted.desc": "Whether shares of files should be removed automatically when they are deleted. Only supported when deleting from within Obsidian.",
    "settings.autoUpdate.name": "Automatically update shares",
    "settings.autoUpdate.desc": "Whether a file's share should automatically be updated when the file is changed from within Obsidian.",
    "settings.language.name": "Language",
    "settings.language.desc": "Language of this plugin. Command names change after Obsidian is restarted.",
    "settings.language.auto": "Automatic",
    "settings.language.fi": "Suomi",
    "settings.language.en": "English",
    "settings.import.name": "Import from Just Share Please",
    "settings.import.desc": "Copies the shares and options of the original Just Share Please plugin. Existing shares, the server URL and the token are kept.",

    "view.title": "Just Share Please",
    "view.empty": "You have not shared any items yet.",
    "view.fileMissing": "File does not exist anymore"
};

export type TranslationKey = keyof typeof en;

const fi: Record<TranslationKey, string> = {
    "command.openView": "Avaa Just Share Please -näkymä",
    "command.share": "Jaa nykyinen tiedosto JSP:hen",
    "command.copy": "Kopioi nykyisen tiedoston JSP-linkki",
    "command.update": "Päivitä nykyinen tiedosto JSP:ssä",
    "command.delete": "Poista nykyinen tiedosto JSP:stä",
    "command.import": "Tuo jaot Just Share Pleasesta",

    "action.share": "Jaa JSP:hen",
    "action.copy": "Kopioi JSP-linkki",
    "action.update": "Päivitä JSP:ssä",
    "action.delete": "Poista JSP:stä",
    "action.open": "Avaa Obsidianissa",

    "notice.shared": "{name} jaettiin ja linkki kopioitiin leikepöydälle",
    "notice.updated": "{name} päivitettiin JSP:ssä",
    "notice.deleted": "{name} poistettiin JSP:stä",
    "notice.localDeleted": "Muistiinpanon {name} paikalliset jakotiedot poistettiin",
    "notice.linkCopied": "Muistiinpanon {name} linkki kopioitiin leikepöydälle",
    "notice.notConfigured": "Aseta ensin palvelimen URL ja token Just Share Please (Self-hosted) -asetuksissa.",

    "button.openSettings": "Avaa asetukset",
    "button.forceDeleteLocal": "Poista paikalliset tiedot väkisin",
    "button.removeLocal": "Poista paikalliset tiedot",

    "error.share": "Virhe jaettaessa muistiinpanoa {name}:",
    "error.update": "Virhe päivitettäessä muistiinpanoa {name}:",
    "error.delete": "Virhe poistettaessa muistiinpanoa {name}:",
    "error.invalidToken": "Token puuttuu tai on väärä – tarkista asetukset.",
    "error.wrongPassword": "Palvelin hylkäsi jaon salasanan.",
    "error.notFound": "Jakoa ei enää ole palvelimella. Voit poistaa sen paikalliset tiedot.",
    "error.tooLarge": "Muistiinpano on liian suuri palvelimelle.",
    "error.rateLimited": "Liian monta epäonnistunutta yritystä. Yritä myöhemmin uudelleen.",
    "error.other": "Palvelin vastasi tilakoodilla {status}.",

    "import.offer": "Alkuperäisen Just Share Please -pluginin jakoja löytyi.",
    "import.button": "Tuo jaot Just Share Pleasesta",
    "import.done": "Asetukset ja {count} uutta jakoa tuotiin Just Share Pleasesta.",
    "import.notFound": "Tästä holvista ei löytynyt Just Share Pleasen tietoja.",
    "import.failed": "Tuonti Just Share Pleasesta epäonnistui: {error}",

    "settings.url.name": "Palvelimen URL",
    "settings.url.desc": "Oman Just Share Please -palvelimesi osoite, esimerkiksi https://jsp.example.com.",
    "settings.token.name": "Token",
    "settings.token.desc": "Palvelimelle määritetty lähetystoken. Se lähetetään jaettaessa, päivitettäessä ja poistettaessa.",
    "settings.includeProperties.name": "Sisällytä tiedoston ominaisuudet",
    "settings.includeProperties.desc": "Näytetäänkö jaetun muistiinpanon ominaisuudet (frontmatter) jaossa.",
    "settings.includeNoteName.name": "Sisällytä muistiinpanon nimi",
    "settings.includeNoteName.desc": "Lisätäänkö jaetun muistiinpanon nimi jakoon otsikoksi.",
    "settings.unshareDeleted.name": "Peru poistettujen tiedostojen jako",
    "settings.unshareDeleted.desc": "Poistetaanko tiedoston jako automaattisesti, kun tiedosto poistetaan. Toimii vain, kun tiedosto poistetaan Obsidianissa.",
    "settings.autoUpdate.name": "Päivitä jaot automaattisesti",
    "settings.autoUpdate.desc": "Päivitetäänkö tiedoston jako automaattisesti, kun tiedostoa muutetaan Obsidianissa.",
    "settings.language.name": "Kieli",
    "settings.language.desc": "Tämän pluginin kieli. Komentojen nimet vaihtuvat, kun Obsidian käynnistetään uudelleen.",
    "settings.language.auto": "Automaattinen",
    "settings.language.fi": "Suomi",
    "settings.language.en": "English",
    "settings.import.name": "Tuo Just Share Pleasesta",
    "settings.import.desc": "Kopioi alkuperäisen Just Share Please -pluginin jaot ja asetukset. Nykyiset jaot, palvelimen URL ja token säilyvät.",

    "view.title": "Just Share Please",
    "view.empty": "Et ole vielä jakanut mitään.",
    "view.fileMissing": "Tiedostoa ei ole enää olemassa"
};

export const translations: Record<Language, Record<TranslationKey, string>> = {en, fi};

/**
 * Picks the UI language. An explicit setting wins; otherwise Obsidian's
 * language decides (Finnish for any "fi" locale, English for everything else).
 */
export function resolveLanguage(setting: LanguageSetting | undefined, obsidianLanguage: string | null | undefined): Language {
    if (setting === "fi" || setting === "en")
        return setting;
    let base = (obsidianLanguage ?? "").trim().toLowerCase().split(/[-_]/)[0];
    return base === "fi" ? "fi" : "en";
}

/** Looks up a string and replaces `{param}` placeholders. */
export function translate(language: Language, key: TranslationKey, params: Record<string, string | number> = {}): string {
    let text = translations[language][key] ?? translations.en[key] ?? key;
    return text.replace(/\{(\w+)}/g, (match, name: string) => name in params ? String(params[name]) : match);
}
