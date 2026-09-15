# uBlock Origin

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-ublock.ps1` to obtain the pinned official uBlock Origin 1.74.0 Chromium release. The script records the source URL and SHA-256 in `ublock-release.json`. The unpacked files are intentionally gitignored; the packager includes them. Alternatively select an unpacked directory in the app settings; its location is remembered locally.

Official releases: https://github.com/gorhill/uBlock/releases . Preserve its GPL-3.0 license and source/distribution obligations when redistributing. Electron only supports a subset of Chrome Extension APIs; `electron-chrome-extensions` supplements tabs and webNavigation. Successful loading does not establish working network filtering. The smoke test checks engine initialization and a known ad request; YouTube ad variations still require ongoing checks.
