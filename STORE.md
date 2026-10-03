# Chrome Web Store release materials

The extension title and short summary come from `manifest.json`.

- Title: **Coursedeck — Canvas Student Planner**
- Version: **2.6.0**
- Category: **Education**
- Language: **English**
- Detailed description: [marketing/store-listing.txt](marketing/store-listing.txt), pasted as plain text.
- Homepage: https://github.com/CyberWizardYT9/coursedeck
- Support: https://github.com/CyberWizardYT9/coursedeck/issues
- Privacy: https://github.com/CyberWizardYT9/coursedeck/blob/main/PRIVACY.md

The title and first paragraph naturally describe Canvas, the student planner, assignments, homework, grades, and reminders. Avoid repeated keyword lists, unverified compatibility promises, or claims about ranking in search.

## Assets

Generate with `python marketing/render.py --out <output-directory> --stills` after capturing the local fictional-data preview. Pillow, NumPy and imageio-ffmpeg are development tools only and are not included in the extension.

- Five full-bleed, RGB PNG compositions at **1280 × 800**: assignments, less clutter, weekly plans, calendar, and grades.
- Small promotional tile: **440 × 280**.
- Marquee: **1400 × 560**.
- Existing recognizable store icon: **128 × 128**.
- Landscape video: **1920 × 1080**, 60 fps, approximately 30.37 seconds.
- Portrait video: **1080 × 1920**, 60 fps, approximately 30.37 seconds.

UI images show the actual local preview with fictional student data. They contain no real student records. Video soundtracks are copied from the approved original audio stream without re-encoding, gain changes, fades or retiming. Use `--video wide` or `--video vertical` with `--audio-source <original-video.mp4>` to render.

The store's promotional video field accepts a YouTube URL. A new video needs its own URL; uploading the extension ZIP does not replace the video.

## Release checks

Run `npm ci`, `npm test`, and `npm run package`. Test the unpacked package with Canvas before submission. Check the uploaded draft version and image order, then verify the review/submission status. Store review is controlled by Google; submitting a version does not mean it is already live.

Official requirements: [listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [image specifications](https://developer.chrome.com/docs/webstore/images).
