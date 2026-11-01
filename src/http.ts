// Request helpers and response classification. Must not import "obsidian".

export type Operation = "share" | "update" | "delete";

export type ResponseKind =
    "ok"
    | "invalidToken"
    | "wrongPassword"
    | "notFound"
    | "tooLarge"
    | "rateLimited"
    | "other";

/** Body the server sends with a 401 caused by a missing or wrong upload token. */
export const INVALID_TOKEN_BODY = "Invalid token";

export function classifyResponse(status: number, body: string, operation: Operation): ResponseKind {
    if (status >= 200 && status < 300)
        return "ok";
    switch (status) {
        case 401:
            // Creating a share sends no share password, so a 401 there can only be the token.
            if (operation === "share" || (body ?? "").trim() === INVALID_TOKEN_BODY)
                return "invalidToken";
            return "wrongPassword";
        case 404:
            return operation === "share" ? "other" : "notFound";
        case 413:
            return "tooLarge";
        case 429:
            return "rateLimited";
        default:
            return "other";
    }
}

export function buildHeaders(token: string, password?: string): Record<string, string> {
    let headers: Record<string, string> = {"Authorization": `Bearer ${token.trim()}`};
    if (password !== undefined)
        headers["Password"] = password;
    return headers;
}

export function isConfigured(settings: { url: string, token: string }): boolean {
    return !!settings.url?.trim() && !!settings.token?.trim();
}

/** Normalised server base url without trailing slashes. */
export function baseUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

export function shareEndpoint(url: string, id?: string): string {
    let endpoint = `${baseUrl(url)}/share.php`;
    return id === undefined ? endpoint : `${endpoint}?id=${encodeURIComponent(id)}`;
}
