# VNV Auto Captions

A free, static, browser-based Telugu + English caption editor. No account or application server is required.

## Features
- Upload a local video in Chrome.
- Multilingual Whisper Small multilingual transcription using Transformers.js.
- Edit transcript segments with `start|end|text` lines.
- Preview word highlight, karaoke-style sweep, or sentence captions.
- Download SRT and VTT subtitle files.
- Record a captioned video from browser playback as WebM.
- Portrait (9:16) and landscape (16:9) output canvas layouts.

## Run locally
Because the app uses JavaScript modules, open it through a local web server rather than `file://`.

With Python 3 installed:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

## Deploy publicly for free

This is a static website. Upload the contents of this folder to any static host.

### GitHub Pages
1. Create a public GitHub repository, for example `vnv-auto-captions`.
2. Upload `index.html`, `styles.css`, `app.js`, and this README to the repository root.
3. Open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish the site. Your public URL will be shown in the Pages settings.

### Netlify
1. Sign in to Netlify and choose **Add new site → Deploy manually**.
2. Drag the project folder contents into the deployment area.
3. Netlify publishes the static site and provides a public URL.

### Cloudflare Pages
1. Create a Pages project and connect the Git repository, or upload the project using Direct Upload.
2. Set the build command to blank and output directory to `/` (repository root).
3. Deploy.

## Browser requirements and limitations
- Use a recent desktop version of Google Chrome or Chromium. ChromeOS Flex should work if its Chrome version supports the required browser APIs.
- The first transcription downloads the larger Whisper Small multilingual model from the public Hugging Face model CDN; an internet connection is required. The app itself does not upload video files to a VNV server.
- Speech recognition and video decoding are memory-intensive. Very long or high-resolution videos may fail on devices with limited RAM. Try shorter clips if needed.
- Telugu and mixed Telugu-English recognition quality depends on recording clarity and the model. Always proofread the transcript.
- Whisper chunk timestamps are word-level timestamps are requested from Whisper. Timing and recognition quality can still vary, especially for Telugu and mixed-language speech.
- Export uses browser `MediaRecorder` and creates a WebM file. It records playback in real time. MP4 export is not included in this static version.
- The app depends on third-party CDN resources (Transformers.js, model files, and Google Fonts). If those services are blocked, model loading or font loading may fail.
- No login, tracking, analytics, or server-side project storage is included. Refreshing the page clears the current editing session.

## Project structure
- `index.html` — page structure
- `styles.css` — responsive visual design
- `app.js` — transcription, caption editing, preview, subtitle and video export logic
