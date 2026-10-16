# Noises Lyrics Studio

**Type a song name, get a full lyric video back: synced lyrics, rendered video, thumbnail and SEO.**

Noises Lyrics Studio is a local, browser-based studio for turning a song into a
polished lyrics video. Search for a track (or upload your own audio), sync the
lyrics, render a 1080p MP4 in the browser, and generate a thumbnail plus
YouTube-ready title, description and tags — all on your own machine.

## Features

### Core (no configuration needed)
- **Song search** by name or URL, across several public music sources.
- **Audio download** with a **yt-dlp you install yourself** (nothing is bundled).
- **Automatic lyrics** with time-synced lines, plus a manual **Tap Sync** mode.
- **Client-side rendering** to 1080p MP4 using the WebCodecs API and
  [Mediabunny](https://mediabunny.dev/) — no server rendering, no uploads.
- **A/B thumbnails** — two styled YouTube thumbnails per project.
- **SEO metadata** — title, description and tags, including official streaming
  links and suggested publish times.
- **Upload your own audio** — skip search entirely and use a local file.

### Optional (bring your own credentials)
These are off until you configure them. When they are unconfigured, the app
hides or disables them with a clear message and everything else keeps working.

- **YouTube upload** — publish straight to your own channel using your own
  Google OAuth client.
- **Scheduling** — suggested publish times, stored locally in `.data/`.
- **Quota tracking / daily status** — your upload quota dashboard.
- **Competitor / channel tracking** — follow other channels' latest uploads via
  your own `.data/competitors.json`.
- **Cloud render** — render on GitHub Actions instead of your machine, using
  repository **Secrets** (manual dispatch only).

## Requirements

- **Node.js 20+** (see `.nvmrc`).
- **yt-dlp**, installed separately and available on your `PATH`
  ([installation guide](https://github.com/yt-dlp/yt-dlp#installation)). On
  Windows, download `yt-dlp.exe` and put the folder on your `PATH`; otherwise set
  `YTDLP_PATH` in `.env` to its full path.
- **A Chromium-based browser** (Chrome or Edge) with WebCodecs support for the
  client-side renderer.
- **ffmpeg** is only needed for the optional **cloud render** (the GitHub Actions
  workflow installs it automatically). Local rendering happens in the browser.

## Setup

```bash
git clone <your-fork-url> noises-lyrics-studio
cd noises-lyrics-studio
npm install
cp .env.example .env      # then edit .env if you want the optional features
npm start
```

Then open <http://localhost:3000>.

On Windows you can also double-click **`start.bat`**; on macOS/Linux run
**`./start.sh`**. Both install dependencies and launch the server. The launcher
requires Node.js 20+ and, if the port is already in use, prints a clear message
and exits instead of touching other processes.

### Configuration

All configuration lives in `.env` (see `.env.example`). Everything except
`PORT` is optional:

| Variable | Purpose |
|---|---|
| `PORT` | Local web server port (default `3000`). |
| `YTDLP_PATH` | Full path to yt-dlp if it is not on your `PATH`. |
| `YTDLP_COOKIES` | Path to a Netscape `cookies.txt` for age/region-locked videos. |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REDIRECT_URI` | Your Google OAuth client for YouTube upload. |
| `UPLOAD_TIME_IST` | Default publish time for scheduling (24h `HH:MM`). |
| `SOCIAL_LINKS` | Extra text appended to generated descriptions. |

## Using it

1. **Search & load** — press `Ctrl/⌘+K` and search for a song, or click
   **Upload Audio File** to use your own track.
2. **Review the lyrics** — check the auto-synced timing, or fix it in the raw
   editor / Tap Sync.
3. **Style it** — tweak font size, tracking, glow and background.
4. **Compile** — the browser renders the MP4; the thumbnail and SEO text are
   generated alongside it.
5. **Publish** — copy the metadata into YouTube Studio yourself, or connect
   YouTube upload (below).

### Upload your own audio

Prefer a file you already have? Click **Upload Audio File** in the sidebar (or
the button in the audio-error dialog), pick an MP3/WAV/M4A, and the studio uses
that instead of downloading anything. Then continue as usual.

## Optional feature setup

### YouTube upload (your own OAuth client)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **YouTube Data API v3**.
2. Configure the OAuth consent screen (External; add yourself as a test user).
3. Create an **OAuth client ID** of type *Web application* with the redirect URI
   `http://localhost:3000/api/youtube-callback`.
4. Put the client ID and secret in `.env` as `YOUTUBE_CLIENT_ID` and
   `YOUTUBE_CLIENT_SECRET`.
5. Restart the app and click an upload button to authorize. Tokens are stored in
   the gitignored `.data/tokens/` folder.

Until this is configured, the upload buttons show **“Set up YouTube upload: see
README”**.

### Competitor / channel tracking

Copy `competitors.example.json` to `.data/competitors.json` and replace the
placeholder channel IDs with the channels you want to follow.

### Cloud render (GitHub Actions)

Cloud render runs **only** when you start it manually from your repo's
**Actions** tab (*Cloud Video Render* → *Run workflow*); it never runs on push.
Give it a URL to the audio file and a URL to the project JSON payload.

Set these **repository Secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | Your Google OAuth client. |
| `YOUTUBE_REDIRECT_URI` | Your OAuth redirect URI. |
| `YOUTUBE_REFRESH_TOKEN` | A refresh token for non-interactive upload (optional). |
| `YOUTUBE_CHANNEL_NAME` | Friendly name for that channel (optional). |

The workflow reads credentials **only** from Secrets/environment variables —
never from the payload or a committed file.

## Architecture & tech stack

- **Frontend:** vanilla JavaScript, HTML5 Canvas, WebCodecs (`VideoEncoder`) +
  Mediabunny for client-side MP4 encoding.
- **Backend:** Node.js + Express (search, lyrics, artwork, thumbnails, optional
  upload).
- **Assets:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) for audio.

### Data sources

The app is a client for several third-party services. It sends only the search
terms you type; it does not upload your media anywhere (unless you switch on
YouTube upload).

| Purpose | Service |
|---|---|
| Audio download | YouTube, via [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Track search | YouTube Music (`ytmusic-api`), iTunes, Deezer, Spotify links, `youtube-sr` |
| Artwork | iTunes Search API |
| Lyrics | [LRCLIB](https://lrclib.net/), Genius, YouTube captions |
| Charts / trending | kworb.net |
| Keyword suggestions | Google Suggest |
| Translation | Google Translate |

You are responsible for respecting each service's terms of use.

## Licences

- This project is released under the **GNU General Public License v3.0 or later**
  (`GPL-3.0-or-later`) — see [LICENSE](LICENSE). It is GPL because it uses
  [`ytmusic-api`](https://www.npmjs.com/package/ytmusic-api), which is GPL-3.0.
- The fonts in `bin/fonts/` are under the SIL Open Font License 1.1 — see
  [`bin/fonts/README.md`](bin/fonts/README.md) and
  [`bin/fonts/OFL.txt`](bin/fonts/OFL.txt).

## Disclaimer

**Only use audio and lyrics you have the rights to. This tool doesn't host or
distribute any media.** Downloaded audio and fetched lyrics belong to their
respective artists, labels and rights-holders. Respect the terms of service of
every source this app calls.
