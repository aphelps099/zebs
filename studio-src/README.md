# ZFIT Motion — source

The fitness training video editor, live at **`/studio/`** on the site
(aphelps099.github.io/zebs/studio/). Zeb films the exercise content; you
upload it here, wrap it in the ZFIT series package, and export a finished
MP4 — everything runs in the browser, no video backend.

## What it does

- **Module Builder** — one click seeds the series skeleton: ZFIT sting →
  series title → disclaimer → circuit index → module title → exercise video →
  end card (with the Zeb's Platinum Fitness lockup baked in).
- **Video scenes** — upload MP4/MOV/WebM, trim the start, match scene length
  to the clip, clip audio on/mute + volume. Text overlays (kicker/title/
  subtitle) sit lower-left/center/right with gradient fades, at 30/50/70/100%
  size so the footage can lead. The overlay has its own clock — "Text in at"
  / "Text out at" sliders time it independently of the clip.
- **Tips & timed text** — layer any number of extra text cues on a video
  scene, each with its own start time and on-screen duration: a **Tip**
  lower third (accent bar + label + line) that sweeps in mid-clip and sweeps
  away while the footage keeps playing, or a plain **Text** snippet that
  rises in and fades out.
- **Agenda scenes** — one line per row; the 01/02/03 index markers are off
  by default, flip **Numbers** on per scene for the numbered-list look.
- **Editing** — undo/redo (⌘Z/⇧⌘Z), split at playhead (S), J/K/L shuttle
  with reverse and 2×/4× speeds, arrow-key nudge, drag timeline edges to
  set duration, drag scene cards to reorder, live thumbnails, safe-area
  guides (preview only).
- **Project** — save/load as JSON and autosave to the browser; media is
  referenced by filename and relinks on re-upload.
- **Captions** — import an .srt and the lines land on the right scenes as
  subtitle pills, burned into the export.
- **Ducking** — music auto-dips under the voiceover and recovers after.
- **Zeb cam** — layer a small talking-head clip in the lower third of any
  scene (position, size, start point, audio controls).
- **Music** — loops under the whole video with fade-in/fade-out and volume.
- **Voiceover** — a narration track (recorded or ElevenLabs) that plays once
  from a chosen start point, mixed over the music.
- **Export** — MP4 (H.264 + AAC in Chrome/Edge) rendered frame-by-frame, so
  the file matches the preview exactly. Long clips take a few minutes.

Use **Chrome or Edge** — MP4 export needs WebCodecs.

## Editing the studio

```bash
cd studio-src
npm install
npm run dev        # local dev at http://localhost:3000/zebs/studio
npm run deploy     # builds and replaces ../studio with the fresh export
```

Commit both `studio-src/` (source) and `studio/` (the built site GitHub
Pages actually serves), plus the repo-root `.nojekyll` (required — without
it Pages drops the `_next/` asset folder and the app won't load).

If the site ever moves off the `/zebs/` project path (custom domain at the
root), change `BASE` in `next.config.js` and run `npm run deploy` again.

## Layout

```
studio-src/
  src/lib/motion/       engine — scene model, deterministic canvas renderer,
                        audio mixdown, WebCodecs MP4 export (brand-free)
  src/components/motion ZebsMotionStudio editor + ZFIT chrome
  public/               Futura fonts + Zeb logos
studio/                 built static site (what Pages serves) — regenerate
                        with `npm run deploy`, don't edit by hand
```

The engine originated in the `aphelps099/mysbdc-tools` Motion Studio
(`docs/motion-studio-porting-guide.md` there describes the architecture);
when it gains features there, the `src/lib/motion` diff cherry-picks
cleanly — it contains no brand.

## Next phase

The plan for the brand-generic editor driven by uploadable **style cards**
(CSS-first brand packages — "skills for style") is in
[`docs/style-skills.md`](docs/style-skills.md), along with the editor
roadmap (undo/redo, project save/load, timeline upgrades, split-at-playhead,
audio ducking, captions).
