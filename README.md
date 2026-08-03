# Noises Lyrics Studio

A dynamic, browser-based studio for timing, rendering, and publishing premium lyrics videos. Built specifically for automated YouTube channels and music creators, Noises Lyrics Studio handles the entire pipeline from fetching audio to rendering client-side 1080p MP4s.

## Features

* **Instant Audio & Artwork Fetching:** Search a song name or paste a URL. The studio automatically resolves the highest quality audio and fetches square, high-res cover art.
* **Smart Lyrics Syncing:** Pulls time-synced lyrics automatically. Includes a manual "Tap Sync" mode to lock in exact timing by tapping your spacebar to the beat.
* **Hardware Accelerated Rendering:** Compiles 1080p 60fps videos directly in your browser using the WebCodecs API and Mediabunny. Zero server costs, zero memory leaks, and incredibly fast export times.
* **A/B Testing Thumbnails:** Automatically generates two unique, stylized YouTube thumbnails for A/B testing your click-through rates.
* **Automated YouTube Metadata:** Generates highly optimized YouTube SEO tags, descriptions with official streaming links (Spotify, Apple Music), and suggested publish times based on channel configurations.

## Architecture & Tech Stack

* **Frontend:** Vanilla JavaScript, HTML5 Canvas for real-time video previewing, and WebCodecs (`VideoEncoder`, `AudioEncoder`) for client-side MP4 generation.
* **Backend:** Node.js with Express.
* **Integrations:** iTunes API for artwork, Google Suggest API for real-time SEO tags, and robust fallback engines for lyrics and audio.

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher recommended)
* A modern browser with WebCodecs support (Google Chrome or Microsoft Edge)

### Installation
1. Clone the repository.
2. Run `npm install` to install backend dependencies.
3. (Windows) Double click `Start_Noises_Studio.bat` to automatically start the local server and open the UI. Alternatively, run `npm start` and visit `http://localhost:3000` in your browser.

## Workflow

1. **Search & Load:** Press `Ctrl K` to open the search palette and load a track.
2. **Review Lyrics:** Verify the automatically synced lyrics or edit them in the Raw Editor.
3. **Customize Style:** Adjust the font size, tracking, glow intensity, and background particles.
4. **Export:** Hit Compile. The application will render the video entirely in your browser and automatically save the final `.mp4` and thumbnails.
5. **Publish:** Copy the generated SEO metadata, description, and titles directly into YouTube Studio.

## Disclaimer
This project is built for automated channel workflows. We do not own the rights to the audio downloaded via the search tool. All credits go to the original artists and their respective record labels.
