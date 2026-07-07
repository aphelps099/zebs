/* ═══════════════════════════════════════════════════════
   Motion Studio — deterministic canvas renderer
   renderFrame(ctx, doc, t) draws the exact frame for any
   global time t (ms). The live preview and the MP4
   exporter both call this, so what you see is what
   exports — pixel for pixel.

   All layout is done in "design units": the canvas is
   W×H from the aspect preset and sizes scale with
   u = min(W,H)/1080.
   ═══════════════════════════════════════════════════════ */

import {
  MotionDoc, Scene, AssetMap, VideoMap, resolveScheme, getAspect, sceneAt, ResolvedScheme,
} from './types';
import {
  clamp01, seg, easeOutQuint, easeOutExpo, easeOutBack, easeInCubic,
  easeInOutCubic, hashRandom,
} from './easings';

const TRANS_MS = 600;   // transition into a scene
const EXIT_MS = 450;    // content exit before a hard cut / loop end

// ── Font helpers ──────────────────────────────────────

function fontStr(weight: number, px: number, family: string, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${px}px "${family}", sans-serif`;
}

// ── Word/line layout ──────────────────────────────────

interface Word { text: string; width: number }
interface Line { words: Word[]; width: number }

function layoutLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
): Line[] {
  ctx.font = font;
  const spaceW = ctx.measureText(' ').width;
  const words = text.split(/\s+/).filter(Boolean).map((w) => ({
    text: w,
    width: ctx.measureText(w).width,
  }));

  const lines: Line[] = [];
  let cur: Word[] = [];
  let curW = 0;
  for (const w of words) {
    const next = curW === 0 ? w.width : curW + spaceW + w.width;
    if (next > maxWidth && cur.length > 0) {
      lines.push({ words: cur, width: curW });
      cur = [w];
      curW = w.width;
    } else {
      cur = [...cur, w];
      curW = next;
    }
  }
  if (cur.length) lines.push({ words: cur, width: curW });
  return lines;
}

// ── Animated text block ───────────────────────────────

interface TextBlockOpts {
  text: string;
  font: string;
  px: number;
  lineHeight: number;       // multiplier
  color: string;
  maxWidth: number;
  x: number;                // anchor x
  y: number;                // top of block
  align: 'left' | 'center' | 'right';
  anim: Scene['anim'];
  t: number;                // scene-local time
  tStart: number;           // when this block starts animating
  accent: string;           // accent color (typewriter caret, wipe edge)
  /** Unit stagger override (ms). */
  stagger?: number;
}

/** Measure block height without drawing. */
function measureBlock(
  ctx: CanvasRenderingContext2D,
  o: Pick<TextBlockOpts, 'text' | 'font' | 'px' | 'lineHeight' | 'maxWidth'>,
): { lines: Line[]; height: number } {
  const lines = layoutLines(ctx, o.text, o.font, o.maxWidth);
  return { lines, height: lines.length * o.px * o.lineHeight };
}

/**
 * Draw a text block with the scene's animation preset.
 * Returns the block height. All animations resolve to the same
 * fully-visible layout once complete, so presets are hot-swappable.
 */
function drawTextBlock(ctx: CanvasRenderingContext2D, o: TextBlockOpts): number {
  const { lines, height } = measureBlock(ctx, o);
  ctx.font = o.font;
  ctx.textBaseline = 'alphabetic';
  const spaceW = ctx.measureText(' ').width;
  const lh = o.px * o.lineHeight;
  const stagger = o.stagger ?? (o.anim === 'letter-cascade' ? 26 : o.anim === 'typewriter' ? 34 : 110);
  const unitDur = 620;

  // Flatten to units depending on preset
  const perLetter = o.anim === 'letter-cascade' || o.anim === 'typewriter';
  const perWord = o.anim === 'word-stagger';

  let unitIndex = 0;
  let lastCaret: { x: number; y: number } | null = null;
  let animating = false;

  lines.forEach((line, li) => {
    const baseY = o.y + li * lh + o.px * 0.82; // approx baseline
    let cx = o.align === 'center' ? o.x - line.width / 2 : o.align === 'right' ? o.x - line.width : o.x;

    // Whole-line presets: rise, blur-in, scale-in, wipe, mask-reveal
    if (!perLetter && !perWord) {
      const p = seg(o.t, o.tStart + li * 140, unitDur + 120, easeOutQuint);
      if (p < 1) animating = true;
      if (p <= 0) { unitIndex += line.words.length; return; }

      ctx.save();
      const lineX = o.align === 'center' ? o.x - line.width / 2 : o.align === 'right' ? o.x - line.width : o.x;

      if (o.anim === 'rise') {
        ctx.globalAlpha *= p;
        ctx.translate(0, (1 - p) * o.px * 0.45);
      } else if (o.anim === 'blur-in') {
        ctx.globalAlpha *= p;
        const blur = (1 - p) * o.px * 0.18;
        if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      } else if (o.anim === 'scale-in') {
        const ps = seg(o.t, o.tStart + li * 140, unitDur + 160, easeOutBack);
        ctx.globalAlpha *= p;
        const cxx = o.align === 'center' ? o.x : lineX + line.width / 2;
        ctx.translate(cxx, baseY - o.px * 0.35);
        ctx.scale(0.9 + 0.1 * ps, 0.9 + 0.1 * ps);
        ctx.translate(-cxx, -(baseY - o.px * 0.35));
      } else if (o.anim === 'wipe') {
        ctx.beginPath();
        ctx.rect(lineX - o.px * 0.1, baseY - o.px, (line.width + o.px * 0.25) * p, o.px * 1.5);
        ctx.clip();
        if (p < 1) {
          // wipe edge
          ctx.fillStyle = o.accent;
          ctx.globalAlpha *= 0.9;
          ctx.fillRect(lineX + (line.width + o.px * 0.2) * p - o.px * 0.06, baseY - o.px * 0.9, o.px * 0.05, o.px * 1.15);
          ctx.globalAlpha /= 0.9;
        }
      } else if (o.anim === 'mask-reveal') {
        ctx.beginPath();
        ctx.rect(lineX - o.px * 0.2, baseY - o.px * 1.05, line.width + o.px * 0.4, lh * 1.24);
        ctx.clip();
        ctx.translate(0, (1 - p) * o.px * 1.15);
      }

      ctx.fillStyle = o.color;
      ctx.font = o.font;
      let wx = lineX;
      for (const w of line.words) {
        ctx.fillText(w.text, wx, baseY);
        wx += w.width + spaceW;
      }
      ctx.restore();
      unitIndex += line.words.length;
      return;
    }

    // Per-word / per-letter presets
    for (const w of line.words) {
      if (perWord) {
        const p = seg(o.t, o.tStart + unitIndex * stagger, unitDur, easeOutQuint);
        if (p < 1) animating = true;
        if (p > 0) {
          ctx.save();
          ctx.globalAlpha *= p;
          ctx.translate(0, (1 - p) * o.px * 0.5);
          ctx.fillStyle = o.color;
          ctx.font = o.font;
          ctx.fillText(w.text, cx, baseY);
          ctx.restore();
        }
        cx += w.width + spaceW;
        unitIndex += 1;
      } else {
        // per-letter
        let lx = cx;
        for (const ch of w.text) {
          const chW = ctx.measureText(ch).width;
          if (o.anim === 'typewriter') {
            const on = o.t >= o.tStart + unitIndex * stagger;
            if (!on) animating = true;
            if (on) {
              ctx.fillStyle = o.color;
              ctx.fillText(ch, lx, baseY);
              lastCaret = { x: lx + chW, y: baseY };
            }
          } else {
            const p = seg(o.t, o.tStart + unitIndex * stagger, 380, easeOutQuint);
            if (p < 1) animating = true;
            if (p > 0) {
              ctx.save();
              ctx.globalAlpha *= p;
              ctx.translate(0, (1 - p) * o.px * 0.35);
              ctx.fillStyle = o.color;
              ctx.fillText(ch, lx, baseY);
              ctx.restore();
            }
          }
          lx += chW;
          unitIndex += 1;
        }
        cx += w.width + spaceW;
      }
    }
  });

  // Typewriter caret — blinks while typing, then disappears
  if (o.anim === 'typewriter' && lastCaret !== null && animating) {
    const caret = lastCaret as { x: number; y: number };
    const blink = Math.floor(o.t / 350) % 2 === 0;
    if (blink) {
      ctx.fillStyle = o.accent;
      ctx.fillRect(caret.x + o.px * 0.08, caret.y - o.px * 0.78, o.px * 0.07, o.px * 0.92);
    }
  }

  return height;
}

// ── Small primitives ──────────────────────────────────

function drawKickerLine(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, color: string,
  t: number, tStart: number,
) {
  const p = seg(t, tStart, 500, easeOutQuint);
  if (p <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * p, Math.max(2, w * 0.06));
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string, font: string, color: string,
  x: number, y: number, spacing: number,
  align: 'left' | 'center' | 'right',
  alpha: number,
) {
  ctx.font = font;
  const chars = [...text.toUpperCase()];
  let total = 0;
  const widths = chars.map((c) => {
    const w = ctx.measureText(c).width;
    total += w + spacing;
    return w;
  });
  total -= spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.restore();
  return total;
}

// ── Image drawing (cover fit + Ken Burns) ─────────────

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number, H: number,
  progress: number,
  kenBurns: Scene['kenBurns'],
) {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const cover = Math.max(W / iw, H / ih);

  let zoom = 1;
  let panX = 0;
  const p = easeInOutCubic(clamp01(progress));
  if (kenBurns === 'zoom-in') zoom = 1 + 0.09 * p;
  else if (kenBurns === 'zoom-out') zoom = 1.09 - 0.09 * p;
  else if (kenBurns === 'pan-left') { zoom = 1.12; panX = (0.5 - p) * 0.07 * W; }
  else if (kenBurns === 'pan-right') { zoom = 1.12; panX = (p - 0.5) * 0.07 * W; }

  const s = cover * zoom;
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (W - dw) / 2 - panX, (H - dh) / 2, dw, dh);
}

/**
 * Cover-fit the current frame of an uploaded clip. The caller (preview
 * sync loop or the exporter's frame-exact seeker) is responsible for the
 * element showing the right frame for time t.
 */
function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  W: number, H: number,
) {
  const iw = video.videoWidth || 1;
  const ih = video.videoHeight || 1;
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s;
  const dh = ih * s;
  try {
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } catch {
    // Frame not decodable yet — background fill already covers the canvas
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  scene: Scene,
  scheme: ResolvedScheme,
) {
  const op = scene.overlayOpacity;
  if (scene.overlay === 'none' || op <= 0) return;
  ctx.save();
  if (scene.overlay === 'scrim') {
    ctx.globalAlpha = op;
    ctx.fillStyle = '#0a1220';
    ctx.fillRect(0, 0, W, H);
  } else if (scene.overlay === 'gradient-bottom') {
    const g = ctx.createLinearGradient(0, H * 0.28, 0, H);
    g.addColorStop(0, 'rgba(8,14,24,0)');
    g.addColorStop(1, `rgba(8,14,24,${op})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (scene.overlay === 'gradient-left') {
    const g = ctx.createLinearGradient(0, 0, W * 0.85, 0);
    g.addColorStop(0, `rgba(8,14,24,${op})`);
    g.addColorStop(1, 'rgba(8,14,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (scene.overlay === 'gradient-right') {
    const g = ctx.createLinearGradient(W * 0.15, 0, W, 0);
    g.addColorStop(0, 'rgba(8,14,24,0)');
    g.addColorStop(1, `rgba(8,14,24,${op})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (scene.overlay === 'brand') {
    ctx.globalAlpha = op;
    ctx.fillStyle = scheme.bg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ── Scene backdrop graphics ───────────────────────────

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Optional brand graphic drawn between the background fill and the text
 * layer, in the scene's scheme colors: graph-paper grid, slow-rotating
 * starburst rays, arc-swoop ring outlines, or the soft conic gradient
 * arc. Deterministic in t like everything else here.
 */
function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  sc: SceneCtx,
  scene: Scene,
  scheme: ResolvedScheme,
  t: number,
) {
  if (!scene.backdrop || scene.backdrop === 'none') return;
  const { W, H, u } = sc;
  const fadeIn = seg(t, 0, 900);
  if (fadeIn <= 0) return;
  ctx.save();
  ctx.globalAlpha = fadeIn;

  if (scene.backdrop === 'grid') {
    const step = 84 * u;
    ctx.strokeStyle = withAlpha(scheme.accent, 0.1);
    ctx.lineWidth = Math.max(1, u);
    ctx.beginPath();
    for (let x = (W % step) / 2; x <= W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = (H % step) / 2; y <= H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (scene.backdrop === 'starburst') {
    // radial rays with a slow drift (the hero-stat starburst)
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.hypot(W, H) * 0.62;
    const rays = 24;
    const rot = t * 0.000025 * Math.PI * 2; // ~1.5%/s — gentle drift
    for (let i = 0; i < rays; i++) {
      const a = rot + (i / rays) * Math.PI * 2;
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.addColorStop(0, withAlpha(scheme.accent, 0.1 + (i % 3) * 0.05));
      g.addColorStop(1, withAlpha(scheme.accent, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = (i % 4 === 0 ? 2.4 : 1.2) * u;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 26 * u, cy + Math.sin(a) * 26 * u);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
  } else if (scene.backdrop === 'ring') {
    // arc swoops — two big ring outlines settling in from the lower left
    const p = seg(t, 0, 1400);
    const cx = W * 0.12;
    const cy = H * 1.06;
    const grow = 0.92 + 0.08 * p;
    ctx.strokeStyle = withAlpha(scheme.accent, 0.28);
    ctx.lineWidth = 5 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, H * 0.78 * grow, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(scheme.accent, 0.12);
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, H * 1.02 * grow, 0, Math.PI * 2);
    ctx.stroke();
  } else if (scene.backdrop === 'arc' && 'createConicGradient' in ctx) {
    // soft conic gradient band masked to a ring, low in the frame
    const cx = W * 0.46;
    const cy = H * 1.4;
    const outer = H * 1.05;
    const inner = H * 0.65;
    const g = (ctx as CanvasRenderingContext2D & {
      createConicGradient(startAngle: number, x: number, y: number): CanvasGradient;
    }).createConicGradient(Math.PI, cx, cy);
    g.addColorStop(0, withAlpha(scheme.accent, 0));
    g.addColorStop(0.05, withAlpha(scheme.accent, 0.03));
    g.addColorStop(0.12, withAlpha(scheme.accent, 0.07));
    g.addColorStop(0.2, withAlpha(scheme.accent, 0.11));
    g.addColorStop(0.27, withAlpha(scheme.accent, 0.13));
    g.addColorStop(0.34, withAlpha(scheme.accent, 0.09));
    g.addColorStop(0.42, withAlpha(scheme.accent, 0.04));
    g.addColorStop(0.5, withAlpha(scheme.accent, 0));
    g.addColorStop(1, withAlpha(scheme.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  }

  ctx.restore();
}

// ── Coach-cam picture-in-picture ──────────────────────

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Small clip thumbnail in the lower third (e.g. Zeb talking over the
 * exercise footage). Rounded, accent-ringed, rises in with the scene.
 */
function drawPipOverlay(
  ctx: CanvasRenderingContext2D,
  sc: SceneCtx,
  scene: Scene,
  t: number,
) {
  if (!scene.pipVideoId) return;
  const asset = sc.videos[scene.pipVideoId];
  if (!asset) return;
  const { W, H, u } = sc;
  const p = seg(t, 150, 500, easeOutQuint);
  if (p <= 0) return;

  const pad = 110 * u;
  const w = W * Math.max(0.12, Math.min(0.4, scene.pipSize || 0.24));
  const vw = asset.video.videoWidth || 16;
  const vh = asset.video.videoHeight || 9;
  const h = w * (vh / vw);
  const x = scene.pipPos === 'left' ? pad
    : scene.pipPos === 'center' ? (W - w) / 2
    : W - pad - w;
  const y = H - pad * 0.75 - h;
  const r = 20 * u;
  const scheme = resolveScheme(scene);

  ctx.save();
  ctx.globalAlpha *= p;
  ctx.translate(0, (1 - p) * 24 * u);

  // Drop shadow via a backing plate
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 26 * u;
  ctx.shadowOffsetY = 10 * u;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  // Clip the video into the rounded rect
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  try {
    ctx.drawImage(asset.video, x, y, w, h);
  } catch {
    // frame not decodable yet — plate stays
  }
  ctx.restore();

  // Accent ring
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = scheme.accent;
  ctx.lineWidth = Math.max(2, 4 * u);
  ctx.stroke();

  ctx.restore();
}

// ── Timed text cues ───────────────────────────────────

/** Letter-spaced width of a label, matching drawSpacedText's layout. */
function spacedWidth(ctx: CanvasRenderingContext2D, text: string, font: string, spacing: number): number {
  ctx.font = font;
  const chars = [...text.toUpperCase()];
  let total = 0;
  chars.forEach((c) => { total += ctx.measureText(c).width + spacing; });
  return Math.max(0, total - spacing);
}

/**
 * Extra text layered over the scene on its own clock. 'tip' is a
 * lower-third plate (accent bar + label + line) that sweeps in from
 * its side, holds, and sweeps away while the footage keeps playing;
 * 'text' is a plain display line that rises in and fades out.
 */
function drawTextCues(
  ctx: CanvasRenderingContext2D,
  sc: SceneCtx,
  scene: Scene,
  t: number,
  p: Palette,
) {
  const cues = scene.cues;
  if (!cues || cues.length === 0) return;
  const { W, H, u, doc } = sc;
  const scheme = resolveScheme(scene);

  for (const cue of cues) {
    const label = (cue.label || '').trim();
    const text = (cue.text || '').trim();
    if (!label && !text) continue;
    const dur = Math.max(800, cue.duration || 0);
    const ct = t - Math.max(0, cue.start || 0);
    if (ct < 0 || ct >= dur) continue;

    const enter = seg(ct, 0, 480, easeOutQuint);
    const exit = seg(ct, dur - 420, 420, easeInCubic);
    const alpha = enter * (1 - exit);
    if (alpha <= 0) continue;

    const pos = cue.position || 'lower-left';
    const frame = p.frame;

    if (cue.style === 'tip') {
      const textPx = 30 * u;
      const labelPx = 16 * u;
      const textFont = fontStr(600, textPx, doc.fontBody);
      const labelFont = fontStr(700, labelPx, doc.fontBody);
      const maxW = W * 0.52;
      const { lines, height: textH } = text
        ? measureBlock(ctx, { text, font: textFont, px: textPx, lineHeight: 1.3, maxWidth: maxW })
        : { lines: [], height: 0 };
      const labelW = label ? spacedWidth(ctx, label, labelFont, labelPx * 0.2) : 0;
      const contentW = Math.max(labelW, ...lines.map((l) => l.width), 1);
      const labelH = label ? labelPx + (text ? 14 * u : 0) : 0;
      const padX = 30 * u;
      const padY = 24 * u;
      const barW = 6 * u;
      const plateW = barW + padX * 2 + contentW;
      const plateH = padY * 2 + labelH + textH;

      const x0 = pos === 'lower-right' ? frame.x + frame.w - plateW
        : pos === 'lower-left' ? frame.x
        : (W - plateW) / 2;
      const y0 = pos === 'center' ? (H - plateH) / 2 : frame.y + frame.h - plateH;

      // Sweep in from the plate's side; centered cues rise instead
      const dir = pos === 'lower-right' ? 1 : pos === 'lower-left' ? -1 : 0;
      const xOff = dir * ((1 - enter) + exit) * 90 * u;
      const yOff = dir === 0 ? ((1 - enter) + exit) * 26 * u : 0;

      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(xOff, yOff);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 22 * u;
      ctx.shadowOffsetY = 8 * u;
      roundRectPath(ctx, x0, y0, plateW, plateH, 12 * u);
      ctx.fillStyle = withAlpha(scheme.bg, 0.85);
      ctx.fill();
      ctx.restore();

      ctx.save();
      roundRectPath(ctx, x0, y0, plateW, plateH, 12 * u);
      ctx.clip();
      ctx.fillStyle = p.accent;
      ctx.fillRect(x0, y0, barW, plateH);
      ctx.restore();

      const contentX = x0 + barW + padX;
      let cy = y0 + padY;
      if (label) {
        drawSpacedText(ctx, label, labelFont, p.accent, contentX, cy + labelPx * 0.82, labelPx * 0.2, 'left', 1);
        cy += labelH;
      }
      if (text) {
        ctx.font = textFont;
        ctx.fillStyle = p.fg;
        ctx.textBaseline = 'alphabetic';
        const spaceW = ctx.measureText(' ').width;
        lines.forEach((line, li) => {
          let lx = contentX;
          const baseY = cy + li * textPx * 1.3 + textPx * 0.82;
          for (const w of line.words) {
            ctx.fillText(w.text, lx, baseY);
            lx += w.width + spaceW;
          }
        });
      }
      ctx.restore();
    } else {
      // 'text' — plain display line on its own clock
      const px = 54 * u;
      const font = fontStr(scene.serifTitle ? 400 : 300, px, headingFamily(sc, scene));
      const maxW = frame.w * 0.8;
      const { height } = measureBlock(ctx, { text, font, px, lineHeight: 1.16, maxWidth: maxW });
      const x = pos === 'lower-left' ? frame.x
        : pos === 'lower-right' ? frame.x + frame.w
        : W / 2;
      const align: 'left' | 'center' | 'right' = pos === 'lower-left' ? 'left'
        : pos === 'lower-right' ? 'right' : 'center';
      const y = pos === 'center' ? (H - height) / 2 : frame.y + frame.h - height;

      ctx.save();
      ctx.globalAlpha *= 1 - exit;
      ctx.translate(0, -exit * 20 * u);
      drawTextBlock(ctx, {
        text, font, px, lineHeight: 1.16, color: p.fg,
        maxWidth: maxW, x, y, align,
        anim: 'rise', t: ct, tStart: 0, accent: p.accent,
      });
      ctx.restore();
    }
  }
}

// ── Film grain ────────────────────────────────────────

let grainTile: HTMLCanvasElement | OffscreenCanvas | null = null;

function getGrainTile(): HTMLCanvasElement | OffscreenCanvas {
  if (grainTile) return grainTile;
  const size = 192;
  const c: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const data = g.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(hashRandom(i) * 255);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = c;
  return c;
}

function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const tile = getGrainTile();
  const frame = Math.floor(t / 83); // ~12fps flicker
  const ox = Math.floor(hashRandom(frame * 2 + 1) * 192);
  const oy = Math.floor(hashRandom(frame * 2 + 2) * 192);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  for (let y = -oy; y < H; y += 192) {
    for (let x = -ox; x < W; x += 192) {
      ctx.drawImage(tile as CanvasImageSource, x, y);
    }
  }
  ctx.restore();
}

// ── Scene renderer ────────────────────────────────────

interface SceneCtx {
  W: number;
  H: number;
  u: number; // unit scale = min(W,H)/1080
  doc: MotionDoc;
  assets: AssetMap;
  videos: VideoMap;
}

function contentFrame(sc: SceneCtx) {
  const pad = 110 * sc.u;
  return { x: pad, y: pad, w: sc.W - pad * 2, h: sc.H - pad * 2 };
}

/** Exit factor: 0 = fully visible, 1 = fully exited. */
function exitP(scene: Scene, t: number, exitEnabled: boolean): number {
  if (!exitEnabled) return 0;
  return seg(t, scene.duration - EXIT_MS, EXIT_MS, easeInCubic);
}

/**
 * Draws one scene at local time t. Assumes the canvas transform is identity.
 */
function drawScene(
  ctx: CanvasRenderingContext2D,
  sc: SceneCtx,
  scene: Scene,
  t: number,
  exitEnabled: boolean,
) {
  const { W, H, u, doc, assets, videos } = sc;
  const scheme = resolveScheme(scene);
  const isImage = scene.template === 'image' && scene.imageId && assets[scene.imageId];
  const isVideo = scene.template === 'video' && scene.videoId && videos[scene.videoId];

  // Background
  ctx.fillStyle = scheme.bg;
  ctx.fillRect(0, 0, W, H);
  if (isImage) {
    drawImageCover(ctx, assets[scene.imageId as string].img, W, H, t / scene.duration, scene.kenBurns);
    drawOverlay(ctx, W, H, scene, scheme);
  } else if (isVideo) {
    drawVideoCover(ctx, videos[scene.videoId as string].video, W, H);
    drawOverlay(ctx, W, H, scene, scheme);
  } else {
    drawBackdrop(ctx, sc, scene, scheme, t);
  }

  // Foreground (text) — wrapped in exit fade
  const xp = exitP(scene, t, exitEnabled);
  ctx.save();
  ctx.globalAlpha = 1 - xp;
  ctx.translate(0, -xp * 26 * u);

  // Video scenes keep the scheme accent (brand color over footage);
  // image scenes keep their original fixed accent for back-compat.
  const fg = (isImage || isVideo) ? '#ffffff' : scheme.fg;
  const muted = (isImage || isVideo) ? 'rgba(255,255,255,0.72)' : scheme.muted;
  const accent = isImage ? '#8FC5D9' : scheme.accent;
  const frame = contentFrame(sc);
  const anchorX = scene.align === 'lower-left' ? frame.x
    : scene.align === 'lower-right' ? frame.x + frame.w
    : W / 2;
  const align: 'left' | 'center' | 'right' = scene.align === 'lower-left' ? 'left'
    : scene.align === 'lower-right' ? 'right'
    : 'center';

  // Text scale: shrink the type by scaling the unit the templates size
  // with, while the palette frame stays at full scale so margins hold.
  const textScale = Math.max(0.2, Math.min(1.5, scene.textScale || 1));
  const tsc: SceneCtx = textScale === 1 ? sc : { ...sc, u: u * textScale };
  const palette: Palette = { fg, muted, accent, anchorX, align, frame };

  // Text layer timing — the main text can enter late (tText < 0 means
  // every animation segment is still before its start, so nothing draws)
  // and/or leave early with the standard exit move. Cues and the coach
  // cam run on their own clocks below.
  const textEndMs = scene.textEnd || 0;
  const textExit = textEndMs > 0 ? seg(t, textEndMs, EXIT_MS, easeInCubic) : 0;
  if (textExit < 1) {
    const tText = t - Math.max(0, scene.textStart || 0);
    ctx.save();
    ctx.globalAlpha *= 1 - textExit;
    ctx.translate(0, -textExit * 22 * u);

    switch (scene.template) {
      case 'title':
      case 'image':
      case 'video':
        drawTitleScene(ctx, tsc, scene, tText, palette);
        break;
      case 'disclaimer':
        drawDisclaimerScene(ctx, tsc, scene, tText, palette);
        break;
      case 'statement':
        drawStatementScene(ctx, tsc, scene, tText, palette);
        break;
      case 'stat':
        drawStatScene(ctx, tsc, scene, tText, palette);
        break;
      case 'list':
        drawListScene(ctx, tsc, scene, tText, palette);
        break;
      case 'quote':
        drawQuoteScene(ctx, tsc, scene, tText, palette);
        break;
      case 'endcard':
        drawEndcardScene(ctx, tsc, scene, tText, palette);
        break;
    }

    ctx.restore();
  }

  // Timed text cues (tips / extra snippets) — independent of the main text
  drawTextCues(ctx, sc, scene, t, palette);

  // Coach-cam thumbnail over any template (full-scale units)
  drawPipOverlay(ctx, sc, scene, t);

  // Watermark (constant, subtle)
  const wm = doc.watermark.trim();
  if (wm) {
    ctx.save();
    ctx.globalAlpha *= 0.4;
    ctx.font = fontStr(500, 16 * u, doc.fontBody);
    ctx.fillStyle = fg;
    ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(wm.toUpperCase()).width + wm.length * 1.4 * u;
    drawSpacedText(ctx, wm, fontStr(500, 16 * u, doc.fontBody), fg, W - frame.x - tw, H - 42 * u, 1.4 * u, 'left', 1);
    ctx.restore();
  }

  ctx.restore();

  if (doc.showGrain) drawGrain(ctx, W, H, t);
}

interface Palette {
  fg: string; muted: string; accent: string;
  anchorX: number; align: 'left' | 'center' | 'right';
  frame: { x: number; y: number; w: number; h: number };
}

/**
 * Vertical anchor: returns top y for a stack of totalH. Uses the palette
 * frame (computed at full scale) so scaled-down text keeps the same
 * margins instead of drifting toward the edges.
 */
function stackTop(p: Palette, H: number, scene: Scene, totalH: number): number {
  if (scene.align === 'center') return (H - totalH) / 2;
  return p.frame.y + p.frame.h - totalH; // lower-*
}

function headingFamily(sc: SceneCtx, scene: Scene): string {
  return scene.serifTitle ? sc.doc.fontHeading : sc.doc.fontBody;
}

// — Title / Image-overlay scene —
function drawTitleScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u, doc } = sc;
  const isVertical = sc.H > sc.W;
  const titlePx = (isVertical ? 76 : 88) * u;
  const subPx = 32 * u;
  const kickerPx = 24 * u;
  const family = headingFamily(sc, scene);
  const titleFont = fontStr(scene.serifTitle ? 400 : 300, titlePx, family);
  const maxW = p.frame.w * (p.align === 'center' ? 0.9 : 0.82);

  // Measure stack
  const { height: titleH } = measureBlock(ctx, { text: scene.title, font: titleFont, px: titlePx, lineHeight: 1.14, maxWidth: maxW });
  const hasKicker = !!scene.kicker.trim();
  const hasSub = !!scene.subtitle.trim();
  const kickerH = hasKicker ? kickerPx + 26 * u : 0;
  const dividerH = hasSub ? 34 * u : 0;
  const subH = hasSub
    ? measureBlock(ctx, { text: scene.subtitle, font: fontStr(400, subPx, doc.fontBody), px: subPx, lineHeight: 1.45, maxWidth: maxW * 0.78 }).height + 6 * u
    : 0;
  const totalH = kickerH + titleH + dividerH + subH;
  let y = stackTop(p, sc.H, scene, totalH);

  // Kicker
  if (hasKicker) {
    const kp = seg(t, 60, 480, easeOutQuint);
    const lineW = 46 * u;
    const ky = y + kickerPx * 0.8;
    if (p.align === 'left') {
      drawKickerLine(ctx, p.anchorX, ky - kickerPx * 0.36, lineW, p.accent, t, 0);
      if (kp > 0) {
        ctx.save();
        ctx.globalAlpha *= kp;
        ctx.translate((1 - kp) * -14 * u, 0);
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX + lineW + 20 * u, ky, kickerPx * 0.17, 'left', 1);
        ctx.restore();
      }
    } else if (p.align === 'right') {
      drawKickerLine(ctx, p.anchorX - lineW, ky - kickerPx * 0.36, lineW, p.accent, t, 0);
      if (kp > 0) {
        ctx.save();
        ctx.globalAlpha *= kp;
        ctx.translate((1 - kp) * 14 * u, 0);
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX - lineW - 20 * u, ky, kickerPx * 0.17, 'right', 1);
        ctx.restore();
      }
    } else if (kp > 0) {
      ctx.save();
      ctx.globalAlpha *= kp;
      ctx.translate(0, (1 - kp) * 10 * u);
      drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX, ky, kickerPx * 0.17, 'center', 1);
      ctx.restore();
    }
    y += kickerH;
  }

  // Title
  drawTextBlock(ctx, {
    text: scene.title, font: titleFont, px: titlePx, lineHeight: 1.14,
    color: p.fg, maxWidth: maxW, x: p.anchorX, y,
    align: p.align, anim: scene.anim, t, tStart: hasKicker ? 260 : 80,
    accent: p.accent,
  });
  y += titleH;

  // Divider + subtitle
  if (hasSub) {
    const dp = seg(t, 900, 500, easeOutQuint);
    const dy = y + 16 * u;
    if (dp > 0) {
      ctx.save();
      ctx.globalAlpha *= dp;
      ctx.fillStyle = p.muted;
      const dw = 52 * u * dp;
      const dx = p.align === 'center' ? p.anchorX - dw / 2 : p.align === 'right' ? p.anchorX - dw : p.anchorX;
      ctx.fillRect(dx, dy, dw, Math.max(1.5, 2 * u));
      ctx.restore();
    }
    y += dividerH;
    drawTextBlock(ctx, {
      text: scene.subtitle, font: fontStr(400, subPx, doc.fontBody), px: subPx, lineHeight: 1.45,
      color: p.muted, maxWidth: maxW * 0.78, x: p.anchorX, y,
      align: p.align, anim: 'rise', t, tStart: 1050, accent: p.accent,
    });
  }
}

// — Statement scene: one big line —
function drawStatementScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u } = sc;
  const px = (sc.H > sc.W ? 88 : 108) * u;
  const family = headingFamily(sc, scene);
  const font = fontStr(scene.serifTitle ? 400 : 300, px, family);
  const maxW = p.frame.w * 0.92;
  const { height } = measureBlock(ctx, { text: scene.title, font, px, lineHeight: 1.12, maxWidth: maxW });
  const y = stackTop(p, sc.H, scene, height);
  drawTextBlock(ctx, {
    text: scene.title, font, px, lineHeight: 1.12, color: p.fg,
    maxWidth: maxW, x: p.anchorX, y, align: p.align,
    anim: scene.anim, t, tStart: 120, accent: p.accent,
  });
}

// — Stat scene: eased counter + label —
function drawStatScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u, doc } = sc;
  const numPx = (sc.H > sc.W ? 200 : 230) * u;
  const labelPx = 34 * u;
  const family = headingFamily(sc, scene);
  const numFont = fontStr(scene.serifTitle ? 400 : 300, numPx, family);
  const labelFont = fontStr(400, labelPx, doc.fontBody);

  const countP = seg(t, 200, 1400, easeOutExpo);
  const value = Math.round(scene.statValue * countP);
  const text = `${scene.statPrefix}${value.toLocaleString('en-US')}${scene.statSuffix}`;

  const labelH = scene.attribution.trim()
    ? measureBlock(ctx, { text: scene.attribution, font: labelFont, px: labelPx, lineHeight: 1.45, maxWidth: p.frame.w * 0.66 }).height
    : 0;
  const numH = numPx * 1.02;
  const gap = 30 * u;
  const totalH = numH + (labelH ? gap + labelH : 0);
  let y = stackTop(p, sc.H, scene, totalH);

  const fadeP = seg(t, 100, 500, easeOutQuint);
  ctx.save();
  ctx.globalAlpha *= fadeP;
  ctx.translate(0, (1 - fadeP) * 30 * u);
  ctx.font = numFont;
  ctx.fillStyle = p.fg;
  ctx.textBaseline = 'alphabetic';
  const numW = ctx.measureText(text).width;
  const numX = p.align === 'center' ? p.anchorX - numW / 2 : p.align === 'right' ? p.anchorX - numW : p.anchorX;
  ctx.fillText(text, numX, y + numPx * 0.84);
  ctx.restore();
  y += numH;

  if (labelH) {
    y += gap;
    // accent divider
    const dp = seg(t, 1000, 450, easeOutQuint);
    if (dp > 0) {
      ctx.save();
      ctx.globalAlpha *= dp;
      ctx.fillStyle = p.accent;
      const dw = 56 * u * dp;
      const ddx = p.align === 'center' ? p.anchorX - dw / 2 : p.align === 'right' ? p.anchorX - dw : p.anchorX;
      ctx.fillRect(ddx, y - gap / 2, dw, Math.max(2, 2.4 * u));
      ctx.restore();
    }
    drawTextBlock(ctx, {
      text: scene.attribution, font: labelFont, px: labelPx, lineHeight: 1.45,
      color: p.muted, maxWidth: p.frame.w * 0.66, x: p.anchorX, y,
      align: p.align, anim: 'rise', t, tStart: 1100, accent: p.accent,
    });
  }
}

// — List / agenda scene —
function drawListScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u, doc } = sc;
  const items = scene.body.split('\n').map((s) => s.trim()).filter(Boolean);
  const kickerPx = 24 * u;
  const itemPx = (sc.H > sc.W ? 44 : 50) * u;
  const family = headingFamily(sc, scene);
  const itemFont = fontStr(scene.serifTitle ? 400 : 300, itemPx, family);
  const rowH = itemPx * 1.9;
  const hasKicker = !!scene.kicker.trim();
  const kickerH = hasKicker ? kickerPx + 44 * u : 0;
  const totalH = kickerH + items.length * rowH - (items.length ? itemPx * 0.55 : 0);
  let y = stackTop(p, sc.H, scene, totalH);

  if (hasKicker) {
    const kp = seg(t, 60, 480, easeOutQuint);
    const ky = y + kickerPx * 0.8;
    const lineW = 46 * u;
    if (kp > 0) {
      if (p.align === 'left') {
        drawKickerLine(ctx, p.anchorX, ky - kickerPx * 0.36, lineW, p.accent, t, 0);
        ctx.save();
        ctx.globalAlpha *= kp;
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX + lineW + 20 * u, ky, kickerPx * 0.17, 'left', 1);
        ctx.restore();
      } else if (p.align === 'right') {
        drawKickerLine(ctx, p.anchorX - lineW, ky - kickerPx * 0.36, lineW, p.accent, t, 0);
        ctx.save();
        ctx.globalAlpha *= kp;
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX - lineW - 20 * u, ky, kickerPx * 0.17, 'right', 1);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha *= kp;
        ctx.translate(0, (1 - kp) * 10 * u);
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX, ky, kickerPx * 0.17, 'center', 1);
        ctx.restore();
      }
    }
    y += kickerH;
  }

  items.forEach((item, i) => {
    const tStart = 350 + i * 320;
    const ip = seg(t, tStart, 620, easeOutQuint);
    const rowY = y + i * rowH;
    if (ip <= 0) return;

    ctx.save();
    ctx.globalAlpha *= ip;
    ctx.translate(0, (1 - ip) * 22 * u);

    // Index marker (optional — some cards read better without the numbers)
    const useMarkers = scene.listMarkers !== false;
    const numFont = fontStr(700, 20 * u, doc.fontBody);
    ctx.font = numFont;
    ctx.fillStyle = p.accent;
    const marker = String(i + 1).padStart(2, '0');
    const markerW = useMarkers ? ctx.measureText(marker).width : 0;
    const markerGap = useMarkers ? 34 * u : 0;

    if (p.align === 'left') {
      if (useMarkers) {
        ctx.fillText(marker, p.anchorX, rowY + itemPx * 0.78);
        // rule under number
        ctx.fillRect(p.anchorX, rowY + itemPx * 0.98, markerW, Math.max(1.5, 1.8 * u));
      }
      ctx.font = itemFont;
      ctx.fillStyle = p.fg;
      ctx.fillText(item, p.anchorX + markerW + markerGap, rowY + itemPx * 0.78);
    } else {
      ctx.font = itemFont;
      const itemW = ctx.measureText(item).width;
      const rowW = itemW + markerW + markerGap;
      const startX = p.align === 'right' ? p.anchorX - rowW : p.anchorX - rowW / 2;
      if (useMarkers) {
        ctx.font = numFont;
        ctx.fillStyle = p.accent;
        ctx.fillText(marker, startX, rowY + itemPx * 0.78);
      }
      ctx.font = itemFont;
      ctx.fillStyle = p.fg;
      ctx.fillText(item, startX + markerW + markerGap, rowY + itemPx * 0.78);
    }
    ctx.restore();
  });
}

// — Quote scene —
function drawQuoteScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u, doc } = sc;
  const quotePx = (sc.H > sc.W ? 60 : 68) * u;
  const attrPx = 26 * u;
  const family = headingFamily(sc, scene);
  const quoteFont = fontStr(scene.serifTitle ? 400 : 300, quotePx, family, scene.serifTitle);
  const maxW = p.frame.w * 0.84;
  const text = `“${scene.title}”`;

  const { height: qH } = measureBlock(ctx, { text, font: quoteFont, px: quotePx, lineHeight: 1.28, maxWidth: maxW });
  const hasAttr = !!scene.attribution.trim();
  const attrH = hasAttr ? attrPx + 46 * u : 0;
  const totalH = qH + attrH;
  let y = stackTop(p, sc.H, scene, totalH);

  drawTextBlock(ctx, {
    text, font: quoteFont, px: quotePx, lineHeight: 1.28, color: p.fg,
    maxWidth: maxW, x: p.anchorX, y, align: p.align,
    anim: scene.anim, t, tStart: 120, accent: p.accent,
  });
  y += qH;

  if (hasAttr) {
    const ap = seg(t, 1100, 550, easeOutQuint);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha *= ap;
      ctx.translate(0, (1 - ap) * 12 * u);
      const ay = y + 46 * u;
      ctx.font = fontStr(600, attrPx, doc.fontBody);
      ctx.fillStyle = p.accent;
      const dash = '— ';
      const full = dash + scene.attribution;
      const w = ctx.measureText(full).width;
      const ax = p.align === 'center' ? p.anchorX - w / 2 : p.align === 'right' ? p.anchorX - w : p.anchorX;
      ctx.fillText(full, ax, ay);
      ctx.restore();
    }
  }
}

// — Disclaimer scene: kicker + fine-print paragraph —
function drawDisclaimerScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u, doc } = sc;
  const kickerPx = 24 * u;
  const bodyPx = (sc.H > sc.W ? 26 : 28) * u;
  const bodyFont = fontStr(400, bodyPx, doc.fontBody);
  const maxW = p.frame.w * (p.align === 'center' ? 0.72 : 0.66);
  const hasKicker = !!scene.kicker.trim();
  const kickerH = hasKicker ? kickerPx + 40 * u : 0;
  const { height: bodyH } = measureBlock(ctx, {
    text: scene.body, font: bodyFont, px: bodyPx, lineHeight: 1.62, maxWidth: maxW,
  });
  const totalH = kickerH + bodyH;
  let y = stackTop(p, sc.H, scene, totalH);

  if (hasKicker) {
    const kp = seg(t, 60, 480, easeOutQuint);
    const ky = y + kickerPx * 0.8;
    const lineW = 46 * u;
    if (kp > 0) {
      ctx.save();
      ctx.globalAlpha *= kp;
      ctx.translate(0, (1 - kp) * 10 * u);
      if (p.align === 'left') {
        drawKickerLine(ctx, p.anchorX, ky - kickerPx * 0.36, lineW, p.accent, t, 0);
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX + lineW + 20 * u, ky, kickerPx * 0.17, 'left', 1);
      } else if (p.align === 'right') {
        drawKickerLine(ctx, p.anchorX - lineW, ky - kickerPx * 0.36, lineW, p.accent, t, 0);
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX - lineW - 20 * u, ky, kickerPx * 0.17, 'right', 1);
      } else {
        drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, p.anchorX, ky, kickerPx * 0.17, 'center', 1);
      }
      ctx.restore();
    }
    y += kickerH;
  }

  drawTextBlock(ctx, {
    text: scene.body, font: bodyFont, px: bodyPx, lineHeight: 1.62,
    color: p.muted, maxWidth: maxW, x: p.anchorX, y,
    align: p.align, anim: scene.anim, t, tStart: hasKicker ? 380 : 100,
    accent: p.accent,
  });
}

// — End card scene —
function drawEndcardScene(
  ctx: CanvasRenderingContext2D, sc: SceneCtx, scene: Scene, t: number, p: Palette,
) {
  const { u, doc, assets } = sc;
  const scheme = resolveScheme(scene);
  const darkBg = isDark(scheme.bg);
  // Saturated light backgrounds (e.g. TFG electric green) need the
  // all-black mark — a colored ring would vanish into them.
  const vividBg = !darkBg && isVivid(scheme.bg);
  // Program logos (Pro studio) win over the built-in marks;
  // '-light' is the light-colored mark for dark backgrounds.
  const logo =
    (darkBg
      ? assets['__logo-brand-light'] ?? assets['__logo-brand-dark']
      : assets['__logo-brand-dark'] ?? assets['__logo-brand-light']) ??
    (darkBg
      ? assets['__logo-white']
      : (vividBg ? assets['__logo-black'] ?? assets['__logo-blue'] : assets['__logo-blue']));

  const logoH = logo ? 96 * u : 0;
  const kickerPx = 22 * u;
  const titlePx = 64 * u;
  const subPx = 22 * u;
  const hasKicker = !!scene.kicker.trim();
  const hasSub = !!scene.subtitle.trim();

  const parts = [
    logo ? logoH + 56 * u : 0,
    hasKicker ? kickerPx + 30 * u : 0,
    titlePx * 1.1,
    hasSub ? subPx * 1.5 + 40 * u : 0,
  ];
  const totalH = parts.reduce((a, b) => a + b, 0);
  let y = (sc.H - totalH) / 2;

  // Logo
  if (logo) {
    const lp = seg(t, 80, 700, easeOutQuint);
    if (lp > 0) {
      const iw = logo.img.naturalWidth || 1;
      const ih = logo.img.naturalHeight || 1;
      const w = (logoH / ih) * iw;
      ctx.save();
      ctx.globalAlpha *= lp;
      ctx.translate(0, (1 - lp) * 18 * u);
      ctx.drawImage(logo.img, sc.W / 2 - w / 2, y, w, logoH);
      ctx.restore();
    }
    y += parts[0];
  }

  // Kicker
  if (hasKicker) {
    const kp = seg(t, 500, 500, easeOutQuint);
    if (kp > 0) {
      ctx.save();
      ctx.globalAlpha *= kp;
      drawSpacedText(ctx, scene.kicker, fontStr(700, kickerPx, doc.fontBody), p.accent, sc.W / 2, y + kickerPx * 0.8, kickerPx * 0.2, 'center', 1);
      ctx.restore();
    }
    y += parts[1];
  }

  // Main line (URL / CTA)
  drawTextBlock(ctx, {
    text: scene.title,
    font: fontStr(scene.serifTitle ? 400 : 300, titlePx, headingFamily(sc, scene)),
    px: titlePx, lineHeight: 1.1, color: p.fg,
    maxWidth: p.frame.w * 0.9, x: sc.W / 2, y,
    align: 'center', anim: scene.anim, t, tStart: 700, accent: p.accent,
  });
  y += parts[2];

  // Fine print
  if (hasSub) {
    const sp = seg(t, 1300, 600, easeOutQuint);
    if (sp > 0) {
      ctx.save();
      ctx.globalAlpha *= sp * 0.7;
      ctx.font = fontStr(400, subPx, doc.fontBody);
      ctx.fillStyle = p.muted;
      const w = ctx.measureText(scene.subtitle).width;
      ctx.fillText(scene.subtitle, sc.W / 2 - w / 2, y + 40 * u + subPx);
      ctx.restore();
    }
  }
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

/** Strongly saturated color (channel spread), vs. near-neutral whites/grays. */
function isVivid(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b) > 100;
}

// ── Top-level frame renderer ──────────────────────────

let transBuffer: HTMLCanvasElement | null = null;

function getTransBuffer(W: number, H: number): HTMLCanvasElement {
  if (!transBuffer || transBuffer.width !== W || transBuffer.height !== H) {
    transBuffer = document.createElement('canvas');
    transBuffer.width = W;
    transBuffer.height = H;
  }
  return transBuffer;
}

/** Whether a scene runs its exit animation (only before hard cuts / at the end). */
function exitEnabled(doc: MotionDoc, index: number): boolean {
  const next = doc.scenes[index + 1];
  if (!next) return true; // last scene: exit clean for looping
  return next.transition === 'cut';
}

/**
 * Render the frame at global time t (ms) into ctx.
 * The ctx may be pre-scaled (preview) — drawing happens in design units.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  doc: MotionDoc,
  t: number,
  assets: AssetMap,
  videos: VideoMap = {},
): void {
  const { w: W, h: H } = getAspect(doc.aspect);
  const sc: SceneCtx = { W, H, u: Math.min(W, H) / 1080, doc, assets, videos };

  if (doc.scenes.length === 0) {
    ctx.fillStyle = '#0f1c2e';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const { index, local } = sceneAt(doc, t);
  const scene = doc.scenes[index];
  const prev = index > 0 ? doc.scenes[index - 1] : null;
  const inTransition = prev !== null && scene.transition !== 'cut' && local < TRANS_MS;

  if (!inTransition) {
    drawScene(ctx, sc, scene, local, exitEnabled(doc, index));
    return;
  }

  // Transition: draw previous scene's final frame, then composite current on top
  const p = easeInOutCubic(local / TRANS_MS);
  drawScene(ctx, sc, prev as Scene, (prev as Scene).duration, false);

  const buf = getTransBuffer(W, H);
  const bctx = buf.getContext('2d') as CanvasRenderingContext2D;
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, W, H);
  drawScene(bctx, sc, scene, local, exitEnabled(doc, index));

  ctx.save();
  if (scene.transition === 'fade') {
    ctx.globalAlpha = p;
    ctx.drawImage(buf, 0, 0);
  } else if (scene.transition === 'wipe') {
    ctx.beginPath();
    ctx.rect(0, 0, W * p, H);
    ctx.clip();
    ctx.drawImage(buf, 0, 0);
    ctx.restore();
    ctx.save();
    if (p < 1) {
      ctx.fillStyle = resolveScheme(scene).accent;
      ctx.globalAlpha = 0.9 * (1 - Math.abs(p * 2 - 1));
      ctx.fillRect(W * p - 3, 0, 6, H);
    }
  } else if (scene.transition === 'slide') {
    ctx.drawImage(buf, (1 - p) * W, 0);
  }
  ctx.restore();
}

export { TRANS_MS, EXIT_MS };
