/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 ARA
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * StreamQuality
 * Forces the resolution, frame rate and bitrate of your Go Live stream
 * and blocks quality drops requested by Discord or by viewers.
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ApplicationStreamingStore, MediaEngineStore } from "@webpack/common";

const SoundUtils = findByPropsLazy("playSound", "createSound");

const TAG = "[StreamQuality]";
const ORIGINAL = Symbol("StreamQuality.original");
const NOTICE_COOLDOWN_MS = 60_000;
const MIN_KBPS = 500;
const MAX_KBPS = 50_000;

function validBitrate(value: unknown) {
    const kbps = Number(value);
    return (Number.isFinite(kbps) && kbps >= MIN_KBPS && kbps <= MAX_KBPS)
        || `Enter a number between ${MIN_KBPS} and ${MAX_KBPS}`;
}

const settings = definePluginSettings({
    resolution: {
        type: OptionType.SELECT,
        description: "Stream resolution. \"Same as Discord\" keeps what you pick in Discord's stream menu and only forces fps and bitrate.",
        options: [
            { label: "Same as Discord (keeps your aspect ratio)", value: "source", default: true },
            { label: "Ultrawide 1080p (2560x1080)", value: "2560x1080" },
            { label: "Ultrawide 1440p (3440x1440)", value: "3440x1440" },
            { label: "720p (1280x720)", value: "1280x720" },
            { label: "1080p (1920x1080)", value: "1920x1080" },
            { label: "1440p (2560x1440)", value: "2560x1440" },
            { label: "4K (3840x2160)", value: "3840x2160" }
        ]
    },
    framerate: {
        type: OptionType.SELECT,
        description: "Frames per second",
        options: [
            { label: "30 fps", value: 30 },
            { label: "60 fps", value: 60, default: true }
        ]
    },
    bitrateTarget: {
        type: OptionType.NUMBER,
        description: "Bitrate Discord aims for, in kbps (Discord's server accepts about 9000)",
        default: 9000,
        isValid: validBitrate
    },
    bitrateMin: {
        type: OptionType.NUMBER,
        description: "Lowest bitrate Discord may aim for, in kbps. Too high for your internet can cause freezes.",
        default: 4000,
        isValid: validBitrate
    },
    bitrateMax: {
        type: OptionType.NUMBER,
        description: "Highest bitrate, in kbps",
        default: 9000,
        isValid: validBitrate
    },
    ignoreViewerRequests: {
        type: OptionType.BOOLEAN,
        description: "Ignore viewers' requests to lower resolution or fps (always send full quality)",
        default: true
    },
    notifyBlocked: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when a quality drop is blocked",
        default: true
    },
    sounds: {
        type: OptionType.BOOLEAN,
        description: "Play a soft, low sound when the plugin activates and when it blocks a quality drop",
        default: true
    },
    soundStyle: {
        type: OptionType.SELECT,
        description: "Which sound to play",
        options: [
            { label: "Plugin sound (soft and low)", value: "chime", default: true },
            { label: "Discord message sound", value: "discord" }
        ]
    },
    soundVolume: {
        type: OptionType.SLIDER,
        description: "Sound volume",
        markers: [0, 25, 50, 75, 100],
        default: 30,
        stickToMarkers: false
    },
    debug: {
        type: OptionType.BOOLEAN,
        description: "Log what Discord sends to the developer console (for troubleshooting)",
        default: false
    }
});

let engine: any = null;
let poll: ReturnType<typeof setInterval> | null = null;
let audioCtx: AudioContext | null = null;

// State of the current stream
let lastSent = "";
let discordMaxSeen = 0;
let discordFpsSeen = 0;
let lastNotice = 0;

function log(...args: any[]) {
    if (settings.store.debug) console.log(`%c${TAG}`, "color:#f9a8d4;font-weight:bold", ...args);
}

function notify(body: string) {
    try {
        showNotification({ title: "StreamQuality", body, color: "#f9a8d4" });
    } catch (err) {
        log("Notification failed:", err);
    }
}

function toNumber(value: unknown, fallback: number) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

// ---------- sounds ----------

function getVolume() {
    return clamp(toNumber(settings.store.soundVolume, 30), 0, 100) / 100;
}

// Discord's own message sound, if we can reach it
function tryDiscordSound(volume: number) {
    try {
        if (typeof SoundUtils?.playSound !== "function") return false;
        SoundUtils.playSound("message1", volume);
        return true;
    } catch {
        return false;
    }
}

// The plugin's own sound: pure, low sine tones with a slow, click-free fade
function chime(freqs: number[], volume: number, duration: number, gap: number) {
    try {
        audioCtx ??= new AudioContext();
        const ctx = audioCtx;
        if (ctx.state === "suspended") ctx.resume();
        let t = ctx.currentTime;
        for (const freq of freqs) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.3 * volume + 0.0001, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + duration + 0.02);
            t += duration + gap;
        }
    } catch (err) {
        log("Sound failed:", err);
    }
}

function playAlert(kind: "active" | "blocked") {
    if (!settings.store.sounds) return;
    const volume = getVolume();
    if (volume <= 0) return;

    if (settings.store.soundStyle === "discord" && tryDiscordSound(volume)) {
        if (kind === "blocked") setTimeout(() => tryDiscordSound(volume), 300);
        return;
    }
    if (kind === "active") chime([262, 392], volume, 0.25, 0.08); // two low rising notes
    else chime([220, 220], volume, 0.2, 0.12); // two low, soft taps
}

// ---------- stream logic ----------

type Targets = ReturnType<typeof getTargets>;

function getTargets() {
    const res = String(settings.store.resolution);
    const source = !/^\d+x\d+$/.test(res);
    const [width, height] = source ? [0, 0] : res.split("x").map(Number);

    // Keep the numbers sane even if the settings were edited by hand: min <= target <= max
    const max = clamp(toNumber(settings.store.bitrateMax, 9000), MIN_KBPS, MAX_KBPS);
    const target = clamp(toNumber(settings.store.bitrateTarget, max), MIN_KBPS, max);
    const min = clamp(toNumber(settings.store.bitrateMin, MIN_KBPS), MIN_KBPS, target);

    return {
        source,
        width,
        height,
        fps: toNumber(settings.store.framerate, 60) === 30 ? 30 : 60,
        min: Math.round(min * 1000), // Discord uses bits per second
        target: Math.round(target * 1000),
        max: Math.round(max * 1000)
    };
}

// True when YOU are streaming (not when you only watch someone else)
function isOwnStreamActive() {
    try {
        if (typeof ApplicationStreamingStore?.getCurrentUserActiveStream !== "function") return true; // can't tell
        return !!ApplicationStreamingStore.getCurrentUserActiveStream();
    } catch {
        return true;
    }
}

function fullPixels(t: Targets) {
    if (!t.source) return t.width * t.height;
    const dpr = window.devicePixelRatio || 1;
    return Math.round(screen.width * dpr) * Math.round(screen.height * dpr);
}

function findDrops(options: any, t: Targets) {
    const drops: string[] = [];

    const max = options.encodingVideoMaxBitRate;
    if (typeof max === "number") {
        if (discordMaxSeen && max < discordMaxSeen) drops.push(`Discord tried to lower max bitrate to ${Math.round(max / 1000)} kbps, kept ${t.max / 1000}`);
        discordMaxSeen = Math.max(discordMaxSeen, max);
    }

    const fps = options.encodingVideoFrameRate;
    if (typeof fps === "number") {
        if (discordFpsSeen && fps < discordFpsSeen) drops.push(`Discord tried to lower fps to ${fps}, kept ${t.fps}`);
        discordFpsSeen = Math.max(discordFpsSeen, fps);
    }

    if (settings.store.ignoreViewerRequests) {
        const px = options.remoteSinkWantsPixelCount;
        if (typeof px === "number" && px > 0 && px < fullPixels(t) * 0.9) drops.push(`a viewer asked for fewer pixels (${px})`);
        const viewerFps = options.remoteSinkWantsMaxFramerate;
        if (typeof viewerFps === "number" && viewerFps > 0 && viewerFps < t.fps) drops.push(`a viewer asked for ${viewerFps} fps`);
    }

    return drops;
}

function override(options: any, t: Targets) {
    const out: any = {
        ...options,
        encodingVideoMinBitRate: t.min,
        encodingVideoBitRate: t.target,
        encodingVideoMaxBitRate: t.max,
        encodingVideoFrameRate: t.fps
    };
    if (!t.source) {
        out.encodingVideoWidth = t.width;
        out.encodingVideoHeight = t.height;
    }
    if (settings.store.ignoreViewerRequests) {
        out.remoteSinkWantsPixelCount = 0;
        out.remoteSinkWantsMaxFramerate = t.fps;
    }

    if (Array.isArray(options.streamParameters)) {
        out.streamParameters = options.streamParameters.map((p: any) => {
            if (p?.type !== "video") return p;
            const q = { ...p };
            if ("maxBitrate" in q) q.maxBitrate = t.max;
            if ("maxFrameRate" in q) q.maxFrameRate = t.fps;
            if (!t.source && q.maxResolution) q.maxResolution = { ...q.maxResolution, width: t.width, height: t.height };
            return q;
        });
    }
    return out;
}

function handle(original: Function, self: any, options: any) {
    // Leave other people's streams alone
    if (!isOwnStreamActive()) return original.call(self, options);

    const opts = options ?? {};
    const t = getTargets();
    const forced = override(opts, t);

    const json = JSON.stringify(opts);
    if (json !== lastSent) {
        lastSent = json;
        log("Discord sent:", json);
        log("Forcing:", JSON.stringify(forced));
    }

    const drops = findDrops(opts, t);
    if (drops.length) {
        log("Blocked:", drops.join(", "));
        if (Date.now() - lastNotice > NOTICE_COOLDOWN_MS) {
            lastNotice = Date.now();
            if (settings.store.notifyBlocked) notify(`Blocked a quality drop: ${drops[0]}`);
            playAlert("blocked");
        }
    }

    return original.call(self, forced);
}

function hook(connection: any) {
    if (connection?.context !== "stream") return;

    // A stream connection for someone else's stream (you are watching it)
    const { userId, streamUserId } = connection;
    if (typeof userId === "string" && typeof streamUserId === "string" && userId !== streamUserId) return;

    const native = connection.conn;
    const original = native?.setTransportOptions;
    if (typeof original !== "function" || original[ORIGINAL]) return; // not hookable, or already hooked

    const wrapper: any = function (this: any, options: any) {
        try {
            return handle(original, this, options);
        } catch (err) {
            log("Override failed, using Discord's values:", err);
            return original.call(this, options);
        }
    };
    wrapper[ORIGINAL] = original;

    try {
        native.setTransportOptions = wrapper;
    } catch (err) {
        log("Could not hook the stream connection:", err);
        return;
    }

    lastSent = "";
    discordMaxSeen = 0;
    discordFpsSeen = 0;
    lastNotice = 0;
    log("Stream connection hooked", { userId, streamUserId });

    // Give Discord a moment to register your stream, then apply and confirm
    setTimeout(() => {
        if (native.setTransportOptions !== wrapper) return; // plugin stopped or stream ended
        if (!isOwnStreamActive()) {
            log("This is someone else's stream, leaving it alone");
            return;
        }
        try { native.setTransportOptions({}); } catch { }
        const t = getTargets();
        const label = t.source ? "Discord resolution" : `${t.width}x${t.height}`;
        notify(`Active: ${label} · ${t.fps} fps · ${t.target / 1000} kbps`);
        playAlert("active");
    }, 1500);
}

function unhookAll() {
    try {
        engine?.connections?.forEach?.((connection: any) => {
            const native = connection?.conn;
            const fn = native?.setTransportOptions;
            if (fn?.[ORIGINAL]) native.setTransportOptions = fn[ORIGINAL];
        });
    } catch (err) {
        log("Could not unhook:", err);
    }
}

function attachEngine() {
    if (engine) return true;
    try {
        engine = MediaEngineStore?.getMediaEngine?.() ?? null;
    } catch {
        engine = null;
    }
    if (!engine) return false;
    engine.on?.("Connection", hook);
    log("Media engine found");
    return true;
}

function scan() {
    if (!attachEngine()) return;
    engine.connections?.forEach?.(hook);
}

export default definePlugin({
    name: "StreamQuality",
    description: "Forces resolution, fps and bitrate of your screen share and blocks quality drops",
    authors: [{ name: "ARA", id: 0n }],
    settings,

    start() {
        scan();
        poll = setInterval(scan, 2000);
        log("Started");
    },

    stop() {
        if (poll) clearInterval(poll);
        poll = null;
        engine?.removeListener?.("Connection", hook);
        unhookAll();
        engine = null;
        audioCtx?.close().catch(() => { });
        audioCtx = null;
    }
});
