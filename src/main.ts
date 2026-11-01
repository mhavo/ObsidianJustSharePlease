import {arrayBufferToBase64, ButtonComponent, moment, Notice, Plugin, requestUrl, TFile} from "obsidian";
import {defaultSettings, JSPSettings, SharedItem} from "./settings";
import {JSPSettingsTab} from "./settings-tab";
import {JSPView} from "./view";
import {Language, resolveLanguage, translate, TranslationKey} from "./i18n";
import {baseUrl, buildHeaders, classifyResponse, isConfigured, Operation, ResponseKind, shareEndpoint} from "./http";
import {mergeImported, ORIGINAL_PLUGIN_ID} from "./import";

interface ServerResponse {
    status: number;
    text: string;
    json: unknown;
}

const ERROR_MESSAGES: Record<Exclude<ResponseKind, "ok" | "other">, TranslationKey> = {
    invalidToken: "error.invalidToken",
    wrongPassword: "error.wrongPassword",
    notFound: "error.notFound",
    tooLarge: "error.tooLarge",
    rateLimited: "error.rateLimited"
};

export default class JustSharePleasePlugin extends Plugin {

    public settings: JSPSettings;

    async onload(): Promise<void> {
        let hadData = await this.loadSettings();
        this.addSettingTab(new JSPSettingsTab(this.app, this));

        this.registerView(JSPView.type, l => new JSPView(this, l));
        this.addCommand({
            id: `open-${JSPView.type}`,
            name: this.t("command.openView"),
            callback: async () => {
                if (!this.app.workspace.getLeavesOfType(JSPView.type).length)
                    await this.app.workspace.getRightLeaf(false).setViewState({type: JSPView.type, active: true});
                this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(JSPView.type)[0]);
            }
        });

        this.registerEvent(this.app.workspace.on("file-menu", async (m, f) => {
            if (f instanceof TFile && f.extension == "md") {
                let shared = this.getSharedItem(f.path);
                if (!shared) {
                    m.addItem(i => {
                        i.setTitle(this.t("action.share"));
                        i.setIcon("share");
                        i.onClick(async () => this.shareFile(f));
                    });
                } else {
                    m.addItem(i => {
                        i.setTitle(this.t("action.copy"));
                        i.setIcon("link");
                        i.onClick(() => this.copyShareLink(shared));
                    });
                    m.addItem(i => {
                        i.setTitle(this.t("action.update"));
                        i.setIcon("share");
                        i.onClick(() => this.updateFile(shared, f));
                    });
                    m.addItem(i => {
                        i.setTitle(this.t("action.delete"));
                        i.setIcon("trash");
                        i.onClick(async () => this.deleteFile(shared));
                    });
                }
            }
        }));

        this.registerEvent(this.app.vault.on("rename", (f, p) => {
            if (f instanceof TFile) {
                let shared = this.getSharedItem(p);
                if (shared) {
                    shared.path = f.path;
                    this.refreshAllViews();
                }
            }
        }));
        this.registerEvent(this.app.vault.on("delete", f => {
            if (f instanceof TFile) {
                let shared = this.getSharedItem(f.path);
                if (shared) {
                    if (this.settings.unshareDeletedFiles) {
                        this.deleteFile(shared, false);
                    } else {
                        this.refreshAllViews();
                    }
                }
            }
        }));
        this.registerEvent(this.app.vault.on("modify", f => {
            if (this.settings.autoUpdateShares && f instanceof TFile) {
                let shared = this.getSharedItem(f.path);
                if (shared)
                    this.updateFile(shared, f, false);
            }
        }));

        this.addCommand({
            id: "share",
            name: this.t("command.share"),
            editorCheckCallback: (checking, _, ctx) => {
                if (!this.getSharedItem(ctx.file.path)) {
                    if (!checking)
                        this.shareFile(ctx.file);
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "copy",
            name: this.t("command.copy"),
            editorCheckCallback: (checking, _, ctx) => {
                let shared = this.getSharedItem(ctx.file.path);
                if (shared) {
                    if (!checking)
                        this.copyShareLink(shared);
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "update",
            name: this.t("command.update"),
            editorCheckCallback: (checking, _, ctx) => {
                let shared = this.getSharedItem(ctx.file.path);
                if (shared) {
                    if (!checking)
                        this.updateFile(shared, ctx.file);
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "delete",
            name: this.t("command.delete"),
            editorCheckCallback: (checking, _, ctx) => {
                let shared = this.getSharedItem(ctx.file.path);
                if (shared) {
                    if (!checking)
                        this.deleteFile(shared);
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "import-original",
            name: this.t("command.import"),
            callback: () => this.importFromOriginal()
        });

        if (!hadData && await this.hasOriginalData())
            this.app.workspace.onLayoutReady(() => this.offerImport());
    }

    /** Loads settings and returns whether this plugin had any saved data. */
    async loadSettings(): Promise<boolean> {
        let data = await this.loadData();
        this.settings = Object.assign({}, defaultSettings, data);
        this.settings.shared = [...(this.settings.shared ?? [])];
        return !!data;
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    language(): Language {
        let obsidianLanguage: string | null = null;
        try {
            obsidianLanguage = window.localStorage.getItem("language");
        } catch (e) {
            // localStorage may be unavailable; fall back to moment below
        }
        return resolveLanguage(this.settings?.language, obsidianLanguage || moment.locale());
    }

    t(key: TranslationKey, params?: Record<string, string | number>): string {
        return translate(this.language(), key, params);
    }

    getSharedItem(path: string): SharedItem {
        return this.settings.shared.find(f => f.path == path);
    }

    private originalDataPath(): string {
        return `${this.app.vault.configDir}/plugins/${ORIGINAL_PLUGIN_ID}/data.json`;
    }

    async hasOriginalData(): Promise<boolean> {
        try {
            return await this.app.vault.adapter.exists(this.originalDataPath());
        } catch (e) {
            return false;
        }
    }

    private offerImport(): void {
        let notice = new Notice(createFragment(f => {
            f.createSpan({text: this.t("import.offer")});
            new ButtonComponent(f.createDiv({cls: "just-share-please-notice-buttons"}))
                .setButtonText(this.t("import.button"))
                .onClick(async () => {
                    notice.hide();
                    await this.importFromOriginal();
                });
        }), 0);
    }

    /** Imports url, shares and options from the original plugin's data.json. */
    async importFromOriginal(): Promise<boolean> {
        try {
            if (!await this.hasOriginalData()) {
                new Notice(this.t("import.notFound"));
                return false;
            }
            let imported = JSON.parse(await this.app.vault.adapter.read(this.originalDataPath()));
            let result = mergeImported(this.settings, imported);
            this.settings = result.settings;
            await this.saveSettings();
            this.refreshAllViews();
            new Notice(this.t("import.done", {count: result.added}));
            return true;
        } catch (e) {
            new Notice(this.t("import.failed", {error: String(e)}), 10000);
            console.log(e);
            return false;
        }
    }

    openSettings(): void {
        // Not part of the public API, so guard every step.
        let setting = (this.app as unknown as { setting?: { open(): void, openTabById(id: string): void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById(this.manifest.id);
        }
    }

    /** Shows a notice and returns false when the server url or token is missing. */
    private ensureConfigured(): boolean {
        if (isConfigured(this.settings))
            return true;
        let notice = new Notice(createFragment(f => {
            f.createSpan({text: this.t("notice.notConfigured")});
            new ButtonComponent(f.createDiv({cls: "just-share-please-notice-buttons"}))
                .setButtonText(this.t("button.openSettings"))
                .onClick(() => {
                    notice.hide();
                    this.openSettings();
                });
        }), 10000);
        return false;
    }

    private async request(method: string, url: string, headers: Record<string, string>, body?: string): Promise<ServerResponse> {
        let response = await requestUrl({url, method, headers, body, contentType: body !== undefined ? "application/json" : undefined, throw: false});
        let text = "";
        try {
            text = response.text;
        } catch (e) {
            // empty or binary body
        }
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch (e) {
            // not JSON
        }
        return {status: response.status, text, json};
    }

    /** Message describing a failed response, for the given operation. */
    private describeFailure(kind: ResponseKind, status: number): string {
        if (kind === "ok" || kind === "other")
            return this.t("error.other", {status});
        return this.t(ERROR_MESSAGES[kind]);
    }

    private showError(operation: Operation, name: string, detail: string, localItem?: SharedItem, buttonKey?: TranslationKey): void {
        let titleKey: TranslationKey = operation === "share" ? "error.share" : operation === "update" ? "error.update" : "error.delete";
        let notice = new Notice(createFragment(f => {
            f.createSpan({text: `${this.t(titleKey, {name})} `});
            f.createEl("code", {text: detail});
            if (localItem && buttonKey) {
                new ButtonComponent(f.createDiv({cls: "just-share-please-notice-buttons"}))
                    .setButtonText(this.t(buttonKey))
                    .onClick(async _ => {
                        notice.hide();
                        await this.deleteLocalFileInfo(localItem);
                        new Notice(this.t("notice.localDeleted", {name}));
                    });
            }
        }), 10000);
    }

    async shareFile(file: TFile): Promise<SharedItem> {
        if (!this.ensureConfigured())
            return undefined;
        try {
            let response = await this.request("POST", shareEndpoint(this.settings.url), buildHeaders(this.settings.token),
                JSON.stringify({content: await this.preProcessMarkdown(file)}));
            let kind = classifyResponse(response.status, response.text, "share");
            let data = response.json as Partial<SharedItem>;
            if (kind !== "ok" || !data || typeof data.id !== "string" || typeof data.password !== "string") {
                this.showError("share", file.basename, kind === "ok" ? this.t("error.other", {status: response.status}) : this.describeFailure(kind, response.status));
                return undefined;
            }
            let shared: SharedItem = {id: data.id, password: data.password, path: file.path};

            this.settings.shared.push(shared);
            await this.saveSettings();
            this.refreshAllViews();

            await this.copyShareLink(shared, false);
            new Notice(this.t("notice.shared", {name: file.basename}));
            return shared;
        } catch (e) {
            this.showError("share", file.basename, String(e));
            console.log(e);
        }
    }

    async updateFile(item: SharedItem, file: TFile, notice = true): Promise<boolean> {
        if (!this.ensureConfigured())
            return false;
        try {
            let response = await this.request("PATCH", shareEndpoint(this.settings.url, item.id), buildHeaders(this.settings.token, item.password),
                JSON.stringify({content: await this.preProcessMarkdown(file)}));
            let kind = classifyResponse(response.status, response.text, "update");
            if (kind !== "ok") {
                this.showError("update", file.basename, this.describeFailure(kind, response.status),
                    kind === "notFound" ? item : undefined, "button.removeLocal");
                return false;
            }
            if (notice)
                new Notice(this.t("notice.updated", {name: file.basename}));
            return true;
        } catch (e) {
            this.showError("update", file.basename, String(e));
            console.log(e);
            return false;
        }
    }

    async deleteFile(item: SharedItem, notice = true): Promise<boolean> {
        let name = removeExtension(item.path);
        if (!this.ensureConfigured())
            return false;
        try {
            let response = await this.request("DELETE", shareEndpoint(this.settings.url, item.id), buildHeaders(this.settings.token, item.password));
            let kind = classifyResponse(response.status, response.text, "delete");
            if (kind !== "ok") {
                this.showError("delete", name, this.describeFailure(kind, response.status), item,
                    kind === "notFound" ? "button.removeLocal" : "button.forceDeleteLocal");
                return false;
            }

            await this.deleteLocalFileInfo(item);

            if (notice)
                new Notice(this.t("notice.deleted", {name}));
            return true;
        } catch (e) {
            this.showError("delete", name, String(e), item, "button.forceDeleteLocal");
            console.log(e);
            return false;
        }
    }

    async deleteLocalFileInfo(item: SharedItem): Promise<void> {
        this.settings.shared.remove(item);
        await this.saveSettings();
        this.refreshAllViews();
    }

    async copyShareLink(item: SharedItem, notice = true): Promise<void> {
        await navigator.clipboard.writeText(`${baseUrl(this.settings.url)}#${item.id}`);
        if (notice)
            new Notice(this.t("notice.linkCopied", {name: removeExtension(item.path)}));
    }

    async preProcessMarkdown(file: TFile): Promise<string> {
        let text = await this.app.vault.cachedRead(file);

        // strip frontmatter
        let frontmatter = /^(---\s*\n.*?\n---)\s*\n(.*)$/s;
        if (this.settings.stripFrontmatter)
            text = text.replace(frontmatter, "$2");

        // strip comments
        text = text.replace(/%%.*?%%/sg, "");

        // include note name (after frontmatter!)
        if (this.settings.includeNoteName) {
            let title = `# ${file.basename}\n\n`;
            if (frontmatter.test(text)) {
                text = text.replace(frontmatter, `$1\n\n${title}$2`);
            } else {
                text = title + text;
            }
        }

        // embed attachments directly
        let attachments = /!\[(.*)]\((.+)\)|!\[\[(.+)]]/g;
        let match: RegExpExecArray;
        while ((match = attachments.exec(text)) != null) {
            let alt = match[1] ?? "";
            let url = decodeURI(match[2] ?? match[3]);
            if (url.startsWith("http"))
                continue;
            try {
                let resolved = this.app.metadataCache.getFirstLinkpathDest(url, file.path).path;
                let attachment = this.app.vault.getAbstractFileByPath(resolved);
                let data = arrayBufferToBase64(await this.app.vault.readBinary(attachment as TFile));
                let img = `<img src="data:image/${resolved.split(".").pop()};base64, ${data}" alt="${alt}">`;
                text = text.substring(0, match.index) + img + text.substring(match.index + match[0].length);
            } catch (e) {
                console.log(`Error embedding attachment ${url}: ${e}`);
            }
        }

        return text;
    }

    refreshAllViews(): void {
        for (let leaf of this.app.workspace.getLeavesOfType(JSPView.type)) {
            if (leaf.view instanceof JSPView)
                leaf.view.refresh();
        }
    }

}

export function removeExtension(file: string): string {
    let split = file.split(".");
    split.pop();
    return split.join(".");
}
