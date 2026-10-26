# Changelog

## 1.2.0 (2026-10-26)

- StreamQuality now also controls what Discord captures: changing the resolution or frame rate in Discord's stream menu no longer lowers your stream. The frame rate always follows StreamQuality, and so does the resolution unless it's set to Same as Discord

## 1.1.0 (2026-10-26)

- New Video Codec setting (experimental): force H265 / HEVC, AV1 or H264 for your stream and camera, if your PC can encode it. Default: Automatic
- If the chosen codec can't be used on your PC, StreamQuality tells you and lets Discord choose

## 1.0.1 (2026-10-26)

- Clearer notifications: when Discord tries to lower the bitrate or frame rate, the message now says what it asked for and what the plugin kept, for example "Discord tried to lower max bitrate to 4424 kbps, kept 9000"

## 1.0.0 (2026-10-25)

First public release.

- Forces the target, minimum and maximum bitrate and the frame rate of your stream
- Optional fixed resolution, including ultrawide sizes
- Ignores viewers' requests to lower the resolution or frame rate
- Notification, with an optional soft and low sound, when a quality drop is blocked
- Leaves the streams you watch untouched
- Windows installer (Install.bat) that sets up Vencord and the plugin
