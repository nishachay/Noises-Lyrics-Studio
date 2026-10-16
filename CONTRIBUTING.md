# Contributing

Thanks for taking a look at Noises Lyrics Studio. This is a small, local-first
tool; keep changes focused and easy to review.

## Getting set up

```bash
npm install
cp .env.example .env      # optional features only; see README
npm start                 # http://localhost:3000
```

Requirements: Node.js 20+ (see `.nvmrc`) and a system-installed
[yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) on your `PATH`. A
Chromium-based browser is needed for the client-side renderer.

## Before you open a pull request

- Run `npm start` and make sure the app boots with no errors.
- Keep the app working with **zero optional configuration** — no secrets, no
  accounts. Optional features must stay optional (hidden or disabled with a
  clear message when unconfigured).
- **Never commit** audio, video, thumbnails, cookies, tokens, `.env` files or
  anything under `temp/`, `output/` or `.data/`.
- Keep the existing structure, naming and style; prefer small, descriptive
  commits.

The CI workflow only starts the server and checks that it answers with HTTP 200.
It never runs yt-dlp, rendering or anything that needs secrets.

## Reporting bugs

Open an issue with your OS, Node version, the browser you used, what you
expected, and what happened. Please redact any tokens or personal data.

## Licence

This project is licensed under the **GNU General Public License v3.0 or later**
(`GPL-3.0-or-later`). By contributing, you agree that your contributions are
licensed under the same terms.
