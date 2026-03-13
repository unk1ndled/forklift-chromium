# Forklift

A small Chromium extension for [Pitchfork](https://pitchfork.com). When you land on an album review and the site shows the paywall, this extension notices and quietly fetches the full review and score, then puts them back on the page so you can read them.

No popup, no extra permissions—it just runs in the background on album review pages and fixes the view when the paywall drops.

**To try it:** Open Chrome → `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** → select the folder containing `manifest.json`. Then visit a Pitchfork album review; when the paywall appears, the extension will restore the review and score.

You can add your own icons by dropping PNGs in an `icons/` folder and wiring them up in `manifest.json` if you like.
