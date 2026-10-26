/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 ARA
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * StreamQuality updater. This part runs in Discord's main process, because the
 * page part of a plugin can't read GitHub or write files.
 * It only talks to this plugin's GitHub page, and only writes the plugin's own files.
 */

import { IpcMainInvokeEvent } from "electron";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

const RAW_BASE = "https://raw.githubusercontent.com/arakirae/StreamQuality/main/";
const FILES = ["index.ts", "native.ts"];
const VERSION_RE = /const VERSION = "(\d+\.\d+\.\d+)";/;
const PLUGIN_NAME = 'name: "StreamQuality"';

async function download(file: string) {
    // The query string skips GitHub's few-minutes cache, so a new release is seen right away
    const res = await fetch(`${RAW_BASE}${file}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${file}`);
    return res.text();
}

// The folder this plugin was installed in: src/userplugins/<folder>
function findPluginDir(vencordDir: string) {
    const base = join(vencordDir, "src", "userplugins");
    if (!existsSync(base)) return null;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const file = join(base, entry.name, "index.ts");
        if (existsSync(file) && readFileSync(file, "utf8").includes(PLUGIN_NAME)) return join(base, entry.name);
    }
    return null;
}

export async function getLatestVersion(_: IpcMainInvokeEvent) {
    try {
        const index = await download("index.ts");
        return { ok: true as const, version: index.match(VERSION_RE)?.[1] ?? null };
    } catch (err) {
        return { ok: false as const, error: String(err) };
    }
}

export async function downloadUpdate(_: IpcMainInvokeEvent, version: string) {
    try {
        const [index, native] = await Promise.all(FILES.map(download));

        // Only accept files that really are StreamQuality, in the version we announced
        if (!index.includes(PLUGIN_NAME) || index.match(VERSION_RE)?.[1] !== version)
            return { ok: false as const, error: "the new index.ts on GitHub isn't the expected version" };
        if (!native.includes("export async function downloadUpdate"))
            return { ok: false as const, error: "the new native.ts on GitHub doesn't look right" };

        // Vencord's own updater uses the same folder: dist is inside the Vencord folder
        const dir = findPluginDir(join(__dirname, ".."));
        if (!dir) return { ok: false as const, error: "StreamQuality's folder wasn't found in src/userplugins" };

        for (const [i, name] of FILES.entries()) {
            const target = join(dir, name);
            writeFileSync(`${target}.new`, [index, native][i]);
            renameSync(`${target}.new`, target);
        }
        return { ok: true as const, dir };
    } catch (err) {
        return { ok: false as const, error: String(err) };
    }
}
