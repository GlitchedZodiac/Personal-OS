# Pitaya — Spirit on iPad, rounds 1+2 (design archive)

Drop this folder's contents into docs/design/. One .dc.html per screen,
kebab-named per repo convention; each file is standalone-readable HTML
(support.js alongside makes them render in a browser; the import tool can
read them raw). Icons and marks are inline SVG throughout.

Files + sizes (all under the 256 KiB read cap):
- pitaya-ipad-00-home.dc.html — 28 KiB
- pitaya-ipad-01-sermon-desk.dc.html — 45 KiB
- pitaya-ipad-02-bible-modes.dc.html — 37 KiB
- pitaya-ipad-03-notebook-rail.dc.html — 34 KiB
- pitaya-ipad-04-guided-study.dc.html — 51 KiB
- pitaya-ipad-05-bible-overlay.dc.html — 38 KiB
- pitaya-ipad-06-sunday-replay.dc.html — 36 KiB
- pitaya-ipad-07-bible-states.dc.html — 29 KiB
- pitaya-ipad-08-notebook-states.dc.html — 24 KiB
- pitaya-ipad-09-worksheets.dc.html — 26 KiB
- pitaya-ipad-10-desk-states.dc.html — 28 KiB
- pitaya-ipad-11-settings.dc.html — 21 KiB

Notes for the port:
- Screens 00-04 carry an "annotations" tweak (data-props) — the dark canvas
  header/notes are presentation chrome, not app UI.
- The 1180×820 div inside the device frame is the screen; everything outside
  the rounded frame is canvas presentation.
- Cross-links between files use the kebab names in this folder.
