# Pocket Imposter — Rules site

The rules, help and updater for the Pocket Imposter handheld party game, linked
from the QR code on the device's Info screens. Marked `noindex` so it stays
unlisted: findable by anyone holding the device, not by search engines. The
same files are also the TestFlight iPhone app (see `../ios-app`).

## Layout (remade 2026-11-15)

Five pages, one per tab:

- `index.html` Home
- `how-to-play/` Word and Tag, one at a time (`#word` / `#tag`)
- `play/` the web game (unlocked with a box's code)
- `box/` every button, setting, the lock, battery and care
- `help/` quick fixes, questions and the feedback form

Plus the two computer-only tools, `update/` and `calibrate/` (Fix touch).

- `site.css` and `site.js` are shared by every page.
- The header, tab bar and footer are generated. Edit `tools/site_shell.py` in the
  project, then run it. Don't hand-edit between the `shell:` markers.
- `word/`, `tag/`, `tips/`, `lock/`, `settings/`, `questions/` and `feedback/`
  are redirects to where those pages live now. `site_shell.py` writes them.
- The version banner reads `firmware/manifest.json`, so it is always the
  version the updater actually serves. There is no version to type by hand.
- The site before the remake is the git tag `pre-remake-2026-11-15`.
