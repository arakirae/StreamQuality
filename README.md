# StreamQuality

A [Vencord](https://vencord.dev) plugin that keeps your Discord screen share at the quality you choose.

It forces the bitrate and frame rate of your Go Live stream, stops Discord and your viewers from quietly lowering them, and tells you when it blocks a drop.

[![Vencord plugin](https://img.shields.io/badge/Vencord-plugin-f9a8d4)](https://vencord.dev)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-f9a8d4)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-f9a8d4)](LICENSE)

**Italiano:** [leggi la guida in italiano](README.it.md)

<img src="docs/notification-blocked.png" alt="StreamQuality notification: Blocked a quality drop: a viewer asked for fewer pixels (921600)" width="400">

## Features

- **Forced bitrate.** Sets the target, minimum and maximum bitrate of your stream (by default 9000, 4000 and 9000 kbps).
- **Forced frame rate.** 30 or 60 fps, even if someone changes Discord's stream menu.
- **Optional fixed resolution.** Keep the resolution you pick in Discord, or force one that Discord's stream menu can't change, including ultrawide sizes like 2560x1080.
- **Ignores downscale requests.** When a viewer makes the stream window smaller, Discord asks your PC to send fewer pixels. StreamQuality keeps sending full quality.
- **Codec choice (experimental).** Force H265 (HEVC) if your PC can encode it: better quality at the same bitrate, especially in motion. By default Discord still decides.
- **Tells you what it blocked.** A notification, plus an optional soft, low-pitched sound, at most once a minute. Everything also goes into Vencord's notification log.
- **Updates from inside Discord.** When a new version is out, a notification appears when Discord starts. Click it to update, then click again to restart Discord.
- **Leaves other streams alone.** It only changes the stream you send, never the ones you watch.

## What it can't do

- **Go past Discord's limit.** In testing, Discord's server accepted about 9000 kbps at most, so higher values don't help.
- **Make very fast motion perfect.** About 9 Mbps of H.264 isn't much for a fast game at high resolution. See [Tips](#tips-for-a-sharper-stream).
- **Unlock codecs Discord doesn't support on your PC.** The codec option only picks among the codecs Discord can encode with your graphics card (for example, many cards can't stream in AV1).
- **Keep the bitrate graph flat.** In calm scenes the encoder needs less data and sends less by itself. That's normal: the picture stays sharp.
- **Fix a slow connection.** See [Before you start](#before-you-start).

## Before you start

- **Windows** with the **Discord desktop app** (not the browser).
- **A good upload speed.** The default 9000 kbps needs a stable upload of about 12 Mbps or more. Check yours with a speed test. If it's lower, set Bitrate Target and Bitrate Max to about 70% of your upload and Bitrate Min to about half of that (for example 4000, 4000 and 2000 with a 6 Mbps upload).
- **Vencord built from source.** Plugins like this one only work with a Vencord you build yourself. The installer does it for you and keeps your Vencord settings.

Vencord's team doesn't support custom plugins, so please ask for help with StreamQuality [here](../../issues), not in Vencord's server.

## Installation

### Automatic (recommended)

1. Download **[StreamQuality.zip](https://github.com/arakirae/StreamQuality/releases/latest/download/StreamQuality.zip)** from the latest release. It holds only what you need to install.
2. Right click the ZIP → **Extract All**.
3. Open the extracted folder and double-click **Install.bat**.
   If Windows shows a warning, click **More info → Run anyway** (or **Run**).
4. Follow the window. The installer:
   - installs Git and Node.js if they're missing (Windows may ask for permission)
   - installs pnpm
   - updates your Vencord folder if you already build Vencord from source (in your user folder or in Documents), otherwise downloads Vencord into `C:\Users\<you>\Vencord`
   - adds StreamQuality and builds Vencord
   - asks whether to install Vencord into Discord: answer **Y** the first time, then pick your Discord with the arrow keys and press Enter
5. Fully close Discord: right click its icon next to the clock → **Quit Discord**. Then open it again.
6. Go to **User Settings → Vencord → Plugins**, search for **StreamQuality** and turn it on.

### Manual (if you already build Vencord from source)

1. In your Vencord folder, create `src\userplugins\streamQuality`.
2. Put `index.ts` and `native.ts` from this repository in it.
3. Run `pnpm build` in your Vencord folder.
4. Fully restart Discord and turn on StreamQuality.

Vencord's own guide: [installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/).

## Settings

| Setting | Default | What it does |
|---|---|---|
| Resolution | Same as Discord | Keeps the resolution from Discord's stream menu, or forces one that the menu can't change |
| Framerate | 60 fps | Frames per second of your stream. Discord's stream menu can't change it |
| Bitrate Target | 9000 | The bitrate Discord aims for, in kbps |
| Bitrate Min | 4000 | The lowest bitrate Discord may aim for. With a fast, stable connection you can raise it to 7000 |
| Bitrate Max | 9000 | The highest bitrate. About 9000 is Discord's limit |
| Ignore Viewer Requests | On | Keeps full quality when viewers ask for less |
| Video Codec | Automatic | Forces a codec for your stream and camera (experimental). Restart Discord after changing it |
| Notify Blocked | On | Shows a notification when a quality drop is blocked |
| Sounds | On | Soft, low sound: two rising notes when your stream starts, two short taps when it blocks a drop |
| Sound Style | Plugin sound | Or Discord's message sound |
| Sound Volume | 30 | From 0 to 100 |
| Check Updates | On | When Discord starts, checks GitHub for a new version. You choose whether to install it |
| Debug | Off | Writes what Discord sends to the developer console |

StreamQuality's settings win over Discord's stream menu: the frame rate always, the resolution unless you leave it on **Same as Discord**. In that case pick the resolution in Discord: when you choose what to share, click the gear icon at the bottom right, choose **Custom**, then set the resolution (for example **Source**).

## Tips for a sharper stream

- **Try H265.** Set Video Codec to **H265 / HEVC** and restart Discord. In Discord's stream debug, the Codec field should now say H265. If a viewer can't see your stream, their PC can't play H265: set it back to Automatic.
- **Turn off film grain, motion blur and chromatic aberration** in your games. They change every pixel in every frame, which is the hardest thing to compress. This alone often helps more than any setting.
- **Match your viewers' screens.** If your friends watch on 1080p monitors, a 1080p stream looks just as sharp to them and leaves more data for each pixel.
- **Slow games: try 30 fps.** Each frame gets twice the data.

## Is it working?

- When your stream starts you'll see **Active: …** (and hear two low notes if sounds are on).
- When Discord or a viewer tries to lower the quality, you'll see **Blocked a quality drop: …** followed by what they asked for. The drop didn't happen: your settings stay as they are.
- If you hear the sound but see no notification, Discord wasn't in focus, so Vencord sent it as a Windows notification. In Vencord's notification settings, set the style to **Always use Vencord notifications**, or check **Notification Log** in Vencord's settings.

## Updating

When a new version is out, a notification appears a few seconds after Discord starts: click it, wait for the second notification, then click that one to restart Discord. Your settings are kept.

You can also download [StreamQuality.zip](https://github.com/arakirae/StreamQuality/releases/latest/download/StreamQuality.zip) again and run **Install.bat**. Versions before 1.3.0 can't update themselves, so update them this way once.

## Uninstalling

- To turn it off, disable StreamQuality in **Vencord → Plugins**.
- To remove it, delete the `src\userplugins\streamQuality` folder inside your Vencord folder (usually `C:\Users\<you>\Vencord`), run `pnpm build` in your Vencord folder, then fully restart Discord.

## FAQ

**Does StreamQuality connect to the internet?**
Only to this GitHub page: once when Discord starts, to check for a new version, and when you click to install an update. It only downloads files and sends none of your data; GitHub just sees an ordinary download. Turn off Check Updates to stop it.

**Can I get banned for this?**
Client mods like Vencord go against Discord's Terms of Service. Vencord says there are no known cases of users banned for using client mods, but you use them at your own risk.

**Does it work in the browser, on Vesktop, macOS or Linux?**
It was made and tested on Windows with the Discord desktop app, and it hooks into that app's video engine. The browser isn't supported, and the rest is untested.

**Why does my bitrate go below the minimum?**
In calm scenes the encoder simply needs less data. The minimum stops Discord from aiming lower; it can't make the encoder add data that isn't needed.

**My stream freezes or stutters.**
Your upload is probably too slow for the bitrate. Lower Bitrate Target, Min and Max (see [Before you start](#before-you-start)).

**Install.bat says something went wrong.**
The red message says what failed. Most often Git or Node.js was just installed and Windows hasn't picked it up yet: close the window and run Install.bat again. If it still fails, [open an issue](../../issues) with a screenshot.

## Credits

- Made by ARA.
- Built on [Vencord](https://github.com/Vendicated/Vencord).
- Inspired by [BetterScreenshare](https://github.com/philhk/Vencord/tree/better-plugins) by philhk.
- The codec option uses the same Discord hook as Equicord's [StreamingCodecDisabler](https://github.com/Equicord/Equicord/tree/main/src/equicordplugins/streamingCodecDisabler).

## Support

StreamQuality is free. If it made your streams better, you can [buy me a coffee on Ko-fi](https://ko-fi.com/arakirae). Found a bug or have an idea? [Open an issue](../../issues).

## License

[GPL-3.0-or-later](LICENSE). You can use, change and share StreamQuality freely, as long as what you share stays under the same license.

StreamQuality isn't affiliated with Discord or Vencord.
