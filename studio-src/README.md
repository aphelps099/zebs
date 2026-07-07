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
  size so the footage can lead.
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
