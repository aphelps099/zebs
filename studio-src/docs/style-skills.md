# Next phase — Style Cards ("skills for style")

**Goal:** a second, brand-generic copy of the video editor where the branding
is not baked in. You upload a **style card** — a small CSS(-first) package
that carries fonts, colors, logos, and voice — and the whole editor plus every
export renders in that brand. Think of it exactly like a Claude *skill*, but
for visual identity: drop the card in, the tool "knows" the brand.

ZFIT stays as-is at `/studio/`; it simply becomes the first style card.

---

## 1 · Why the architecture is already 90% there

The engine (`src/lib/motion/`) is deliberately brand-free — everything
brand-shaped is already a *parameter*:

| Brand surface | Where it lives today | Style-card ready? |
| --- | --- | --- |
| Colors | `CustomScheme { bg, fg, accent }` per scene, resolved by `resolveScheme()` (`types.ts`) | ✅ just data |
| Color presets | `ZEBS_SCHEMES` hardcoded in `ZebsMotionStudio.tsx:59` | ⚠ extract |
| Fonts | `doc.fontHeading` / `doc.fontBody` + `fonts.ts` (`registerFontFile`, Typekit, self-hosted `@font-face`) | ✅ mechanism exists |
| Logos | Magic asset ids `__logo-brand-light` / `__logo-brand-dark` / `__logo-white` … consumed by the end-card renderer | ✅ just assets |
| Default copy & scene recipes | `ZEBS_SCENE_DEFAULTS`, `zebsScene()`, `buildModule()` hardcoded in the ZFIT wrapper | ⚠ extract |
| Editor chrome (UI skin) | `motion-studio-zebs.css` overriding `motion-studio.css` vars | ✅ already CSS variables |

So the phase is mostly **extraction**: pull the ZFIT-specific constants out of
`ZebsMotionStudio.tsx` into a data object, define a file format for that
object, and build a loader + a generic editor shell that consumes it.

## 2 · What a style card is

A style card is **one CSS file** (human-writable, the "brand kit as code"),
optionally zipped together with its assets:

```
acme-style-card/
  style-card.css      ← required. tokens + @font-face
  fonts/*.woff2       ← referenced by the CSS
  logo-light.png      ← mark for dark backgrounds
  logo-dark.png       ← mark for light backgrounds
  card.json           ← optional extras the CSS can't express
```

Single-file upload (just the `.css`) must also work — fonts can fall back to
system/Typekit families, logos to typeset wordmarks (the end card already
does this for ZFIT).

### 2.1 `style-card.css` — the token contract

Plain CSS custom properties under `:root`, in a reserved `--sc-*` namespace:

```css
/* ACME Fitness — style card v1 */
:root {
  /* identity */
  --sc-name: "ACME Fitness";
  --sc-watermark: "ACME";

  /* type */
  --sc-font-heading: "Acme Black";
  --sc-font-body: "Acme Book";

  /* schemes: up to 6 as bg/fg/accent triplets */
  --sc-scheme-1: "Coal"    #0b0b0b #ffffff #ff4d00;
  --sc-scheme-2: "Ember"   #ff4d00 #0b0b0b #0b0b0b;
  --sc-scheme-3: "Paper"   #f7f4ef #0b0b0b #ff4d00;
  --sc-default-scheme: 1;

  /* motion voice */
  --sc-default-anim: rise;          /* TEXT_ANIMS id */
  --sc-default-transition: fade;    /* TRANSITIONS id */
  --sc-grain: on;
}

@font-face {
  font-family: "Acme Black";
  src: url("fonts/acme-black.woff2") format("woff2");
}
@font-face {
  font-family: "Acme Book";
  src: url("fonts/acme-book.woff2") format("woff2");
}
```

Rules of the format:

- **CSS is the source of truth** for anything CSS can express. `card.json` is
  only for what it can't: default copy per template, module-builder recipes,
  logo file mapping, disclaimers.
- Values we don't recognize are ignored; missing values fall back to the
  neutral defaults. A style card can be three lines and still work.
- `--sc-scheme-N` uses the same three colors as `CustomScheme` — muted/line
  are derived from `fg` exactly as `resolveScheme()` does today.

### 2.2 `card.json` — optional extras

```json
{
  "name": "ACME Fitness",
  "logos": { "light": "logo-light.png", "dark": "logo-dark.png" },
  "sceneDefaults": {
    "title":   { "kicker": "ACME FITNESS", "serifTitle": true },
    "list":    { "kicker": "TODAY'S PLAN", "listMarkers": false },
    "endcard": { "title": "acmefit.com", "kicker": "TRAIN WITH US" }
  },
  "disclaimer": "Consult your physician before beginning…"
}
```

## 3 · Internal model: `BrandPack`

The parsed style card becomes one typed object the editor consumes —
extracted from what is currently hardcoded ZFIT constants:

```ts
interface BrandPack {
  name: string;
  schemes: { id: string; label: string; bg: string; fg: string; accent: string }[];
  defaultScheme: CustomScheme;
  fontHeading: string;
  fontBody: string;
  fontFaces: FontFace[];              // registered on load
  logos: { light?: ImageAsset; dark?: ImageAsset };
  sceneDefaults: Partial<Record<TemplateId, Partial<Scene>>>;
  defaultAnim?: TextAnimId;
  defaultTransition?: TransitionId;
  watermark?: string;
  disclaimer?: string;
  grain?: boolean;
}
```

`ZebsMotionStudio` refactors from "constants at module scope" to
"`<MotionStudioPro pack={ZFIT_PACK} />`" — ZFIT becomes the built-in card and
proves the interface.

## 4 · Loading pipeline

1. **Upload** — accept `.css` or `.zip` (JSZip; zip entries resolved as
   relative URLs → object URLs).
2. **Parse CSS** — instantiate a detached `CSSStyleSheet` via
   `new CSSStyleSheet().replace(cssText)`; read `--sc-*` off the `:root`
   rule. (Custom-property values keep their raw text, so the
   `"Label" #bg #fg #accent` triplet form parses with a small tokenizer.)
   Fallback: regex scan — the format is line-oriented on purpose.
3. **Fonts** — for each `@font-face`, build a `FontFace` from the (object)
   URL and `document.fonts.add()` it — the same path `registerFontFile()`
   uses today. `ensureFontsReady()` already blocks rendering on real font
   load, so exports can't capture fallback glyphs.
4. **Logos** — load into the existing `__logo-brand-light/dark` asset slots;
   the end-card renderer picks light/dark by background luminance already.
5. **Validate + preview** — a swatch strip and type specimen render in the
   Brand panel before "Apply". Errors are per-token warnings, never a hard
   fail.
6. **Apply** — pack lands in state; new scenes seed from
   `pack.sceneDefaults` + `pack.defaultScheme`; "Apply to all scenes"
   restyles an existing doc (mechanism exists: `applyBrandToAll`).

## 5 · Milestones

**M1 — Extract (no behavior change).**
Pull `BrandPack` out of `ZebsMotionStudio.tsx`; ZFIT defined as `ZFIT_PACK`;
editor consumes the pack via props/context. `/studio/` output is pixel-identical.

**M2 — Generic editor route.**
`/studio/pro` (working name): same editor, neutral built-in pack, plus the
**Style Card** section (upload, preview, apply). Editor UI chrome stays
neutral dark — the card brands the *video*, not the app.

**M3 — Loader.**
CSS parser + zip support + font/logo registration + validation panel.
Ship two reference cards in `public/style-cards/`: `zfit.css` (proof: ZFIT
expressed entirely as a card) and `sbdc.css` (the engine's origin brand).

**M4 — Persistence & library.**
Save loaded cards to IndexedDB; card picker ("brand library"); doc save/load
(JSON) records the card it was made with. This is also where project
save/load lands generally — see roadmap.

**M5 — Authoring loop.**
"Export current brand as style card" — turns the Brand panel state (colors,
uploaded fonts/logos, defaults) into a downloadable `style-card.css` + zip.
That makes every brand experiment shareable, which is the "skill" payoff.

## 6 · Open questions

- **Where does the generic editor live?** Same Next app + second route
  (cheapest, shares the engine) vs. a separate `studio-pro/` export. Leaning
  second route; the engine stays one copy.
- **Scene-recipe depth in `card.json`** — do cards ship Module-Builder-style
  *sequences* (sting → title → disclaimer → …), or only per-template
  defaults? Proposal: v1 per-template defaults only; recipes in v2 as a
  `"recipes"` array.
- **Trust boundary** — style cards are data, not code: we parse tokens and
  `@font-face` only, never inject the stylesheet into the page, and only
  whitelisted keys are read. A card can restyle the video, not the app.

---

## Appendix — editor roadmap ("basic Premiere, iMovie simple")

**Shipped — text & cues round:** per-scene text in/out timing on video
scenes, multiple timed text cues per clip including the sweep-in/sweep-away
TIP lower third, numbered list markers off by default (per-scene "Numbers"
toggle).

**Shipped — editing round:**

- **Undo / redo** — debounced doc-history stack (slider drags coalesce),
  ⌘Z / ⇧⌘Z / ⌘Y + transport buttons. Undo flushes any still-debouncing
  edit first so it always steps back exactly one state.
- **Project save / load + autosave** — doc JSON download/upload; autosaves
  to localStorage and restores on reload. Media binaries aren't embedded:
  projects reference files by name, and re-uploading a file with the same
  name relinks it to its old asset id so scenes rejoin automatically.
- **Timeline upgrades** — drag a block's right edge to set duration, drag
  scene cards to reorder, cue tick-marks on blocks, live render thumbnails
  on the scene cards.
- **Split at playhead** — S key or ✂ button; video trim-start, PIP trim,
  text timing, and cues are recomputed for both halves.
- **Audio ducking** — music auto-dips under the voiceover (level + on/off
  in the Music panel), one curve for preview and export (`duckGainAt`).
- **Captions** — SRT import distributes entries onto scenes as quick-fade
  subtitle pills (a third cue style, `caption`); burned into the export.
- **J/K/L shuttle** — L play (repeat = 2×/4×), J reverse (−1×/−2×/−4×),
  K pause; space resets to 1×. Arrows nudge a frame (⇧ = 1s), Home/End
  jump, Delete removes the selected scene.
- **Safe-area guides** — action-safe/title-safe overlay + center cross,
  preview-only (never exported).

Still open, roughly in value order:

1. **Draggable text** — drag the overlay block on the canvas to a custom
   anchor (stored as fractional x/y, snapping to thirds). Deferred: it
   changes the anchor model in every scene template.
2. **Per-clip look controls** — exposure / contrast / saturation +
   a one-click "brand grade" (canvas filters, deterministic in t).
3. **Audio waveform** under the timeline strip; caption editing UI beyond
   the video-scene cue list.
4. **IndexedDB media persistence** — store uploaded binaries so autosave
   restores media too, not just the doc.
