# Final review — Noises Lyrics Studio (public copy)

A self-review of this repository written **as a stranger** (a recruiter or a
developer opening it cold), plus the verification evidence from the cleanup.

## What this repo is

A local, browser-based studio that turns a song into a lyric video: it searches
for the track, fetches lyrics, renders a 1080p MP4 **in your browser**, and
generates a thumbnail plus YouTube-ready metadata. Optional features (YouTube
upload, scheduling, quota tracking, cloud render) are off until you supply your
own credentials.

## The cleanup goal (private copy, history preserved)

- Full history preserved (no squashing), but **no secrets, media, cookies, OAuth
  tokens or bundled binaries** anywhere in it.
- Author names/emails, tags and dates kept as they were.
- Nothing was changed in the original repository; this is a separate copy.

## Verification evidence

| Check | Result |
|---|---|
| Commit count | **304 rewritten + 11 cleanup commits = 315**; original 304 preserved (0 lost) |
| Refs | **23 tags + `main`** preserved |
| Secret scan (gitleaks, full history) | **0 leaks** |
| Per-commit pattern scan (`git rev-list --all` + `git grep -I`) | **clean** across all 315 commits |
| Purged paths (cookies, tokens, secrets, `bin/yt-dlp.exe`) | **0 history commits** |
| Media / secret file types anywhere in history | **none** |
| `youtube_auth.js` credentials | env-var only; no literal secret at HEAD; placeholder only in older history |
| Tracked files | **39** (was 64 before cleanup) |
| Server boot | clean, no uncaught exceptions |
| Licence | GPL-3.0-or-later (because `ytmusic-api` is GPL-3.0) |

## Things a stranger will notice (left in place on purpose)

1. **The "Slideshow" button renders a normal video.** `startCompile()` accepts an
   `isSlideshow` flag but ignores it, and `window.slideshowIndices` is set but
   never read — so this button behaves like the regular export. It is a
   **vestigial UI element**; there is no server route for slideshows anymore.
   *Not removed*, because it lives in the core UI flow and removal was not
   approved. **Owner: decide to remove or reimplement.**
2. **`public/app.js` is a large, monolithic file (~5.3k lines).** Works fine, but
   a reviewer may ask for it to be split into modules.
3. **`/api/quota` and `/api/daily-status` are functional but have no UI.** They
   track upload usage in `.data/`, but the in-app quota widget was removed. Kept
   as optional endpoints on purpose.
4. **`UPLOAD_TIME_IST` is a legacy name** — it is a wall-clock label, not a real
   timezone conversion. The code comment was corrected to say so.
5. **Cloud render is kept but is not part of the local UI.** `run-cloud.js`,
   `video_renderer.js` and `.github/workflows/cloud-render.yml` exist only for
   the manual GitHub Actions workflow (Secrets-only, `workflow_dispatch`). A
   reader might wonder why a server-side renderer exists when the browser does
   the rendering — the file header now explains this.
6. **Third-party dependence.** Search/lyrics/artwork/translation all call public
   services; behavior depends on their availability and terms. See the README
   "Data sources" table.
7. **A live YouTube download can fail on some hosts/networks** (HTTP 403 / JS
   runtime requirements) — that is a YouTube/yt-dlp environment issue, not this
   code; the app tries several formats and fails gracefully.

## Still needs a human

- **One full end-to-end pass in a browser:** search a song, compile a video,
  check the thumbnail and metadata appear, then repeat using **Upload Audio
  File**. This could not be automated here (the render runs client-side via
  WebCodecs, and this host's YouTube access is blocked).

## Owner TODO

- [ ] Decide on the vestigial Slideshow button (remove or reimplement).
- [ ] Optional: split `public/app.js` into modules.
