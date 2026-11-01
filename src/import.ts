// Merging data from the original "just-share-please" plugin. Must not import "obsidian".
import {JSPSettings, SharedItem} from "./settings";

/** Plugin id of the original plugin whose data.json can be imported. */
export const ORIGINAL_PLUGIN_ID = "just-share-please";

/** The original plugin's public server; shares there can't be managed by a self-hosted server. */
const ORIGINAL_PUBLIC_URL = /^https?:\/\/jsp\.ellpeck\.de\/?$/i;

const BOOLEAN_KEYS = ["stripFrontmatter", "includeNoteName", "unshareDeletedFiles", "autoUpdateShares"] as const;

export interface ImportResult {
    settings: JSPSettings;
    /** Number of shares that were not present before. */
    added: number;
}

function isSharedItem(value: unknown): value is SharedItem {
    let item = value as SharedItem;
    return !!item && typeof item === "object"
        && typeof item.id === "string" && item.id !== ""
        && typeof item.password === "string"
        && typeof item.path === "string";
}

/**
 * Merges the original plugin's data into this plugin's settings without mutating either.
 * Shares are merged and deduplicated by id (existing entries win). The url is only taken
 * when none is configured yet. Token and language are never touched.
 */
export function mergeImported(current: JSPSettings, imported: unknown): ImportResult {
    let settings: JSPSettings = {...current, shared: [...current.shared]};
    if (!imported || typeof imported !== "object")
        return {settings, added: 0};
    let data = imported as Record<string, unknown>;

    if (!settings.url.trim() && typeof data.url === "string" && data.url.trim() && !ORIGINAL_PUBLIC_URL.test(data.url.trim()))
        settings.url = data.url.trim();

    for (let key of BOOLEAN_KEYS) {
        if (typeof data[key] === "boolean")
            settings[key] = data[key] as boolean;
    }

    let added = 0;
    if (Array.isArray(data.shared)) {
        let ids = new Set(settings.shared.map(s => s.id));
        for (let item of data.shared) {
            if (!isSharedItem(item) || ids.has(item.id))
                continue;
            settings.shared.push({id: item.id, password: item.password, path: item.path});
            ids.add(item.id);
            added++;
        }
    }
    return {settings, added};
}
