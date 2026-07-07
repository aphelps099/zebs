/* ═══════════════════════════════════════════════════════
   Motion Studio — core types
   A MotionDoc is a sequence of scenes rendered
   deterministically as a pure function of time, so the
   same code drives the live preview and the MP4 export.
   ═══════════════════════════════════════════════════════ */

// ── Canvas aspect presets ──
export const ASPECTS = [
  { id: '16:9', label: 'Landscape', hint: 'YouTube · Slides', w: 1920, h: 1080 },
  { id: '1:1',  label: 'Square',    hint: 'Feed posts',       w: 1080, h: 1080 },
  { id: '9:16', label: 'Vertical',  hint: 'Reels · Stories',  w: 1080, h: 1920 },
  { id: '4:5',  label: 'Portrait',  hint: 'Instagram feed',   w: 1080, h: 1350 },
] as const;

export type AspectId = typeof ASPECTS[number]['id'];

// ── Brand color schemes (mirrors TitleCard) ──
export const SCHEMES = [
  { id: 'navy',  label: 'Navy',  bg: '#0f1c2e', fg: '#ffffff', accent: '#8FC5D9', muted: 'rgba(255,255,255,0.5)',  line: 'rgba(255,255,255,0.16)' },
  { id: 'cream', label: 'Cream', bg: '#f0efeb', fg: '#0f1c2e', accent: '#1D5AA7', muted: 'rgba(15,28,46,0.45)',    line: 'rgba(15,28,46,0.14)' },
  { id: 'royal', label: 'Royal', bg: '#1D5AA7', fg: '#ffffff', accent: '#8FC5D9', muted: 'rgba(255,255,255,0.55)', line: 'rgba(255,255,255,0.22)' },
  { id: 'dark',  label: 'Dark',  bg: '#111827', fg: '#e5e7eb', accent: '#4a8fe2', muted: 'rgba(229,231,235,0.45)', line: 'rgba(255,255,255,0.1)' },
  { id: 'white', label: 'White', bg: '#ffffff', fg: '#0a1528', accent: '#a82039', muted: 'rgba(10,21,40,0.4)',     line: 'rgba(0,0,0,0.1)' },
] as const;

export type SchemeId = typeof SCHEMES[number]['id'];
export type Scheme = typeof SCHEMES[number];

export function getScheme(id: SchemeId): Scheme {
  return SCHEMES.find((s) => s.id === id) ?? SCHEMES[0];
}

/**
 * A program-defined color scheme (Motion Studio Pro). muted/line are
 * derived from fg so a brand only has to pick three colors.
 */
export interface CustomScheme {
  bg: string;
  fg: string;
  accent: string;
}

export interface ResolvedScheme {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  line: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** The scheme a scene actually renders with — custom colors win over the preset. */
export function resolveScheme(scene: Pick<Scene, 'scheme' | 'customScheme'>): ResolvedScheme {
  if (scene.customScheme) {
    const { bg, fg, accent } = scene.customScheme;
    return { bg, fg, accent, muted: hexToRgba(fg, 0.55), line: hexToRgba(fg, 0.16) };
  }
  return getScheme(scene.scheme);
}

// ── Scene templates ──
export const TEMPLATES = [
  { id: 'title',     label: 'Title',     hint: 'Kicker · title · subtitle' },
  { id: 'statement', label: 'Statement', hint: 'One big line' },
  { id: 'stat',      label: 'Stat',      hint: 'Animated number + label' },
  { id: 'list',      label: 'Agenda',    hint: 'Staggered list of lines' },
  { id: 'quote',     label: 'Quote',     hint: 'Pull quote + attribution' },
  { id: 'image',     label: 'Image',     hint: 'Photo + text overlay' },
  { id: 'video',     label: 'Video',     hint: 'Uploaded clip + text overlay' },
  { id: 'disclaimer',label: 'Disclaimer',hint: 'Fine-print paragraph' },
  { id: 'endcard',   label: 'End Card',  hint: 'Logo · CTA · date' },
] as const;

export type TemplateId = typeof TEMPLATES[number]['id'];

// ── Text animation presets ──
export const TEXT_ANIMS = [
  { id: 'rise',           label: 'Rise' },
  { id: 'word-stagger',   label: 'Word Stagger' },
  { id: 'letter-cascade', label: 'Letter Cascade' },
  { id: 'typewriter',     label: 'Typewriter' },
  { id: 'wipe',           label: 'Wipe' },
  { id: 'blur-in',        label: 'Blur In' },
  { id: 'scale-in',       label: 'Scale In' },
  { id: 'mask-reveal',    label: 'Mask Reveal' },
] as const;

export type TextAnimId = typeof TEXT_ANIMS[number]['id'];

// ── Scene transitions (into the scene) ──
export const TRANSITIONS = [
  { id: 'cut',   label: 'Cut' },
  { id: 'fade',  label: 'Fade' },
  { id: 'wipe',  label: 'Wipe' },
  { id: 'slide', label: 'Slide' },
] as const;

export type TransitionId = typeof TRANSITIONS[number]['id'];

// ── Image motion (Ken Burns) ──
export const KEN_BURNS = [
  { id: 'none',      label: 'Still' },
  { id: 'zoom-in',   label: 'Zoom In' },
  { id: 'zoom-out',  label: 'Zoom Out' },
  { id: 'pan-left',  label: 'Pan ←' },
  { id: 'pan-right', label: 'Pan →' },
] as const;

export type KenBurnsId = typeof KEN_BURNS[number]['id'];

// ── Scene backdrop graphics (drawn behind the text in scheme colors) ──
export const BACKDROPS = [
  { id: 'none',      label: 'None' },
  { id: 'grid',      label: 'Grid' },
  { id: 'starburst', label: 'Starburst' },
  { id: 'ring',      label: 'Ring' },
  { id: 'arc',       label: 'Arc' },
] as const;

export type BackdropId = typeof BACKDROPS[number]['id'];

// ── Image overlays for text legibility ──
export const OVERLAYS = [
  { id: 'none',            label: 'None' },
  { id: 'scrim',           label: 'Scrim' },
  { id: 'gradient-bottom', label: 'Grad ↓' },
  { id: 'gradient-left',   label: 'Grad ←' },
  { id: 'gradient-right',  label: 'Grad →' },
  { id: 'brand',           label: 'Brand' },
] as const;

export type OverlayId = typeof OVERLAYS[number]['id'];

// ── Picture-in-picture (coach cam) positions ──
export const PIP_POSITIONS = [
  { id: 'left',   label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right',  label: 'Right' },
] as const;

export type PipPosId = typeof PIP_POSITIONS[number]['id'];

// ── Text scale presets (block size relative to default) ──
export const TEXT_SCALES = [
  { id: '0.3', label: '30%' },
  { id: '0.5', label: '50%' },
  { id: '0.7', label: '70%' },
  { id: '1',   label: '100%' },
] as const;

// ── Alignment ──
export const ALIGNMENTS = [
  { id: 'center',       label: 'Center' },
  { id: 'lower-left',   label: 'Lower Left' },
  { id: 'lower-center', label: 'Lower Center' },
  { id: 'lower-right',  label: 'Lower Right' },
] as const;

export type AlignId = typeof ALIGNMENTS[number]['id'];

// ── Timed text cues ──
// Extra text layered over a scene on its own clock — e.g. a "TIP"
// lower third that sweeps in mid-clip while the video keeps playing,
// or an additional big text snippet with its own in/out times.
export const CUE_STYLES = [
  { id: 'tip',     label: 'Tip' },     // lower-third plate: accent bar + label + line
  { id: 'text',    label: 'Text' },    // plain display text, rises in and fades away
  { id: 'caption', label: 'Caption' }, // subtitle pill, quick fade — SRT import lands here
] as const;

export type CueStyleId = typeof CUE_STYLES[number]['id'];

export const CUE_POSITIONS = [
  { id: 'lower-left',   label: 'Lower Left' },
  { id: 'lower-center', label: 'Lower Center' },
  { id: 'lower-right',  label: 'Lower Right' },
  { id: 'center',       label: 'Center' },
] as const;

export type CuePosId = typeof CUE_POSITIONS[number]['id'];

export interface TextCue {
  id: string;
  style: CueStyleId;
  /** Small accent label on tip plates (e.g. "TIP"). */
  label: string;
  text: string;
  /** Scene-local time the cue enters (ms). */
  start: number;
  /** Time on screen — enter + hold + exit (ms). */
  duration: number;
  position: CuePosId;
}

let cueCounter = 0;

export function makeCue(overrides: Partial<TextCue> = {}): TextCue {
  cueCounter += 1;
  return {
    id: `cue-${Date.now().toString(36)}-${cueCounter}`,
    style: 'tip',
    label: 'TIP',
    text: 'Keep your core tight',
    start: 2000,
    duration: 4000,
    position: 'lower-left',
    ...overrides,
  };
}

// ── Scene ──
export interface Scene {
  id: string;
  template: TemplateId;
  /** Total scene duration in ms (enter + hold + exit). */
  duration: number;
  scheme: SchemeId;
  /** Program colors (Pro studio) — overrides `scheme` when set. */
  customScheme?: CustomScheme | null;
  anim: TextAnimId;
  /** Transition INTO this scene from the previous one. */
  transition: TransitionId;
  align: AlignId;
  /** Optional brand graphic drawn behind the text (scheme colors). */
  backdrop: BackdropId;
  /** Use the serif (heading) font for the main line of this scene. */
  serifTitle: boolean;
  /** Text block scale (0.3–1) — smaller text lets the visuals lead. */
  textScale: number;
  /** Show the numbered markers on list/agenda scenes. */
  listMarkers: boolean;
  /** Delay before the scene's text layer starts animating in (ms). */
  textStart: number;
  /** Scene-local time the text layer exits (ms). 0 = holds until the scene ends. */
  textEnd: number;
  /** Timed text cues layered over the scene on their own clocks. */
  cues: TextCue[];

  // Text content (used per-template)
  kicker: string;
  title: string;
  subtitle: string;
  /** Agenda/list lines, newline separated. */
  body: string;
  /** Quote attribution / stat label. */
  attribution: string;

  // Stat template
  statPrefix: string;
  statValue: number;
  statSuffix: string;

  // Image template
  imageId: string | null;
  kenBurns: KenBurnsId;
  overlay: OverlayId;
  /** 0–1 overlay strength. */
  overlayOpacity: number;

  // Video template
  videoId: string | null;
  /** Offset into the source clip where playback starts (ms). */
  videoTrimStart: number;
  /** Drop the clip's own audio from preview + export. */
  videoMuted: boolean;
  /** 0–1 gain applied to the clip's own audio. */
  videoVolume: number;

  // Coach-cam picture-in-picture (any template) — a small clip layered
  // in the lower third, e.g. Zeb talking over the exercise footage.
  pipVideoId: string | null;
  pipPos: PipPosId;
  /** Thumbnail width as a fraction of the frame width (0.12–0.4). */
  pipSize: number;
  /** Offset into the PIP clip where playback starts (ms). */
  pipTrimStart: number;
  pipMuted: boolean;
  /** 0–1 gain applied to the PIP clip's audio. */
  pipVolume: number;
}

// ── Document ──
export interface MotionDoc {
  aspect: AspectId;
  fps: number;
  scenes: Scene[];
  /** CSS font-family for big display text. */
  fontHeading: string;
  /** CSS font-family for kickers, labels, body. */
  fontBody: string;
  watermark: string;
  showGrain: boolean;

  // Background music (document-wide bed under everything)
  /** Audio asset id, or null for no music. */
  audioId: string | null;
  /** 0–1 music gain. */
  audioVolume: number;
  /** Music fade-in length (ms). */
  audioFadeIn: number;
  /** Music fade-out length before the end (ms). */
  audioFadeOut: number;

  // Voiceover (plays once from voStart, mixed over the music bed)
  voId: string | null;
  /** 0–1 voiceover gain. */
  voVolume: number;
  /** Timeline position where the voiceover begins (ms). */
  voStart: number;
  /** Auto-duck the music while the voiceover plays. */
  audioDuckOn: boolean;
  /** Music gain multiplier while ducked (0–1). */
  audioDuckLevel: number;
}

// ── Loaded image assets, keyed by imageId ──
export interface ImageAsset {
  id: string;
  name: string;
  url: string;
  img: HTMLImageElement;
}

export type AssetMap = Record<string, ImageAsset>;

// ── Uploaded video clips, keyed by videoId ──
export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  /** Muted element used by the canvas for pixels; audio mixes separately. */
  video: HTMLVideoElement;
  /** Source duration in ms. */
  duration: number;
  width: number;
  height: number;
  /** Decoded audio track (null when the clip is silent or undecodable). */
  audioBuffer: AudioBuffer | null;
}

export type VideoMap = Record<string, VideoAsset>;

// ── Uploaded background audio, keyed by audioId ──
export interface AudioAsset {
  id: string;
  name: string;
  url: string;
  /** Decoded PCM used for export mixing. */
  buffer: AudioBuffer;
  /** Element used for preview playback. */
  element: HTMLAudioElement;
}

export type AudioMap = Record<string, AudioAsset>;

let sceneCounter = 0;

export function makeScene(template: TemplateId, overrides: Partial<Scene> = {}): Scene {
  sceneCounter += 1;
  const base: Scene = {
    id: `scene-${Date.now().toString(36)}-${sceneCounter}`,
    template,
    duration: 4000,
    scheme: 'navy',
    customScheme: null,
    anim: 'word-stagger',
    transition: 'fade',
    align: 'center',
    backdrop: 'none',
    serifTitle: false,
    textScale: 1,
    listMarkers: true,
    textStart: 0,
    textEnd: 0,
    cues: [],
    kicker: '',
    title: '',
    subtitle: '',
    body: '',
    attribution: '',
    statPrefix: '$',
    statValue: 0,
    statSuffix: '',
    imageId: null,
    kenBurns: 'zoom-in',
    overlay: 'gradient-bottom',
    overlayOpacity: 0.65,
    videoId: null,
    videoTrimStart: 0,
    videoMuted: false,
    videoVolume: 1,
    pipVideoId: null,
    pipPos: 'right',
    pipSize: 0.24,
    pipTrimStart: 0,
    pipMuted: false,
    pipVolume: 1,
  };

  const defaults: Partial<Record<TemplateId, Partial<Scene>>> = {
    title: {
      kicker: 'UPCOMING WORKSHOP',
      title: 'Grow Your Business with AI',
      subtitle: 'A free hands-on webinar from NorCal SBDC',
    },
    statement: {
      title: 'Free expert advising. Real results.',
      anim: 'mask-reveal',
      serifTitle: true,
    },
    stat: {
      statPrefix: '$',
      statValue: 474,
      statSuffix: 'M',
      attribution: 'in capital accessed by NorCal small businesses',
      anim: 'rise',
      duration: 3500,
    },
    list: {
      kicker: 'WHAT YOU WILL LEARN',
      body: 'Practical AI tools for daily work\nMarketing that actually converts\nFunding options and how to qualify',
      anim: 'rise',
      align: 'lower-left',
      duration: 5000,
    },
    quote: {
      title: 'The SBDC helped us go from an idea to a thriving storefront.',
      attribution: 'Maria G. — Small Business Owner',
      serifTitle: true,
      anim: 'blur-in',
      duration: 5000,
    },
    image: {
      kicker: 'SEPT 24 · 12PM',
      title: 'Marketing Bootcamp',
      subtitle: 'Register free at norcalsbdc.org',
      align: 'lower-left',
      anim: 'rise',
    },
    video: {
      kicker: '',
      title: '',
      subtitle: '',
      align: 'lower-left',
      anim: 'rise',
      duration: 10000,
      overlay: 'gradient-bottom',
      overlayOpacity: 0.55,
    },
    disclaimer: {
      kicker: 'BEFORE YOU BEGIN',
      body: 'Consult your physician before starting this or any exercise program. By participating you agree that you do so voluntarily and at your own risk.',
      anim: 'rise',
      duration: 5000,
    },
    endcard: {
      title: 'norcalsbdc.org',
      subtitle: 'Funded in part through a cooperative agreement with the U.S. SBA',
      kicker: 'REGISTER TODAY',
      duration: 3500,
      anim: 'rise',
    },
  };

  return { ...base, ...(defaults[template] ?? {}), ...overrides };
}

export function defaultDoc(): MotionDoc {
  return {
    aspect: '16:9',
    fps: 30,
    scenes: [
      makeScene('title'),
      makeScene('list'),
      makeScene('endcard'),
    ],
    fontHeading: 'proxima-sera',
    fontBody: 'proxima-nova',
    watermark: '',
    showGrain: true,
    audioId: null,
    audioVolume: 0.8,
    audioFadeIn: 2000,
    audioFadeOut: 2000,
    voId: null,
    voVolume: 1,
    voStart: 0,
    audioDuckOn: true,
    audioDuckLevel: 0.3,
  };
}

export function getAspect(id: AspectId) {
  return ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
}

export function docDuration(doc: MotionDoc): number {
  return doc.scenes.reduce((sum, s) => sum + s.duration, 0);
}

/** Locate the active scene + local time for a global time t (ms). */
export function sceneAt(doc: MotionDoc, t: number): { index: number; local: number } {
  let acc = 0;
  for (let i = 0; i < doc.scenes.length; i++) {
    const d = doc.scenes[i].duration;
    if (t < acc + d || i === doc.scenes.length - 1) {
      return { index: i, local: Math.min(t - acc, d) };
    }
    acc += d;
  }
  return { index: 0, local: 0 };
}
