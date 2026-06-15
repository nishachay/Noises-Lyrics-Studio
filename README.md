# Noises Lyrics Studio

A local, browser-based tool to quickly generate synced lyric videos, vertical Shorts, and Instagram carousels (image slideshows). No external dependencies, completely local rendering, and built-in YouTube Music fetching.

## Features

* **Instant Audio Fetching:** Paste a YouTube link or search a song name. The tool automatically downloads the audio and fetches high-res square cover art from iTunes.
* **Auto-Sync & Translate:** Pulls time-synced lyrics automatically. Can auto-translate lyrics into dual-language formats.
* **Tap Sync:** A manual sync mode. Listen to the song and tap the spacebar to lock in the exact timing for each lyric line.
* **Triple Export Options:**
  * **Full Video:** 1080p or 720p 60fps horizontal lyric video.
  * **Shorts / Reels:** Select an offset and instantly export a 9:16 vertical video for TikTok/Shorts.
  * **Carousel (ZIP):** Select specific lyric lines and export them as a ZIP folder of high-res square images, perfect for Instagram carousels.

## How to Run

1. Double-click `Start_Noises_Studio.bat`.
2. It will start the local server and automatically open `http://localhost:3000` in your browser.

## Output Structure

When you export a project, the files are saved directly into the `/output` folder with clear names:
* `Artist - Song_12345.mp4` (Full Video)
* `Artist - Song_12345_short.mp4` (Vertical Short)
* `Artist - Song_12345_slideshow.zip` (Carousel Images)
* `Artist - Song_12345_thumbnail.jpg` (YouTube Thumbnail)
* `Artist - Song_12345_metadata.txt` (Ready-to-paste SEO tags, YouTube Title, and Description with copyright disclaimer)
