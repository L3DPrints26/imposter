# Pocket Imposter — Rules site

The rules, help and updater for the Pocket Imposter handheld party game, linked
from the QR code on the device's Info screens. Marked `noindex` so it stays
unlisted: findable by anyone holding the device, not by search engines.

## Layout

The home page (`index.html`) is a hub with one card per page. Each section has
its own folder: `how-to-play/`, `tips/`, `word/`, `tag/`, `lock/`, `settings/`,
`update/`, `questions/`, `feedback/`, plus `calibrate/` (Fix touch) and
`play/` (the web game).

- `site.css` and `site.js` are shared by every page.
- The header, nav and footer are generated. Edit `tools/site_shell.py` in the
  project, then run it. Don't hand-edit between the `shell:` markers.
- The version banner reads `firmware/manifest.json`, so it is always the
  version the updater actually serves. There is no version to type by hand.
- Old single-page links like `/#update` redirect to the new pages.
