/* ═══════════════════════════════════════════════════════
   Motion Studio — font manager
   · Load an Adobe Fonts (Typekit) kit by ID or URL
   · Register uploaded font files (woff2/woff/otf/ttf)
   · Wait for families to be ready before canvas render,
     so text measures and draws with the real font.

   The site already loads kit pkl5rjs globally (layout.tsx),
   which provides proxima-nova and proxima-sera.
   ═══════════════════════════════════════════════════════ */

export const DEFAULT_KIT_ID = 'pkl5rjs';

export interface FontOption {
  family: string;
  label: string;
  source: 'typekit' | 'local' | 'upload';
}

/** Fonts we know are available out of the box (ZFIT self-hosts Futura). */
export function builtinFonts(): FontOption[] {
  return [];
}

/** Normalize "pkl5rjs", "https://use.typekit.net/pkl5rjs.css", or "<link …>" to a kit CSS URL. */
export function normalizeKitUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // Full URL pasted (or inside a <link> snippet)
  const urlMatch = raw.match(/https?:\/\/use\.typekit\.net\/([a-z0-9]+)\.css/i);
  if (urlMatch) return `https://use.typekit.net/${urlMatch[1].toLowerCase()}.css`;
  // Bare kit ID
  const idMatch = raw.match(/^[a-z0-9]{5,10}$/i);
  if (idMatch) return `https://use.typekit.net/${raw.toLowerCase()}.css`;
  return null;
}

/**
 * Inject a Typekit kit stylesheet and resolve with the font families
 * it declares. Resolves [] if families can't be read (CSS still applies).
 */
export function loadTypekitKit(input: string): Promise<string[]> {
  const href = normalizeKitUrl(input);
  if (!href) return Promise.reject(new Error('Enter a Typekit kit ID (e.g. pkl5rjs) or a use.typekit.net URL'));

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[href="${href}"]`);
    const link = (existing as HTMLLinkElement) ?? document.createElement('link');
    const finish = () => resolve(readKitFamilies(href));

    if (existing) {
      // Already present (e.g. the global kit) — just read families
      finish();
      return;
    }
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = finish;
    link.onerror = () => reject(new Error('Kit failed to load — check the kit ID and its allowed domains'));
    document.head.appendChild(link);
  });
}

/** Read font-family names declared by a kit stylesheet already in the page. */
function readKitFamilies(href: string): string[] {
  const families = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href !== href) continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSFontFaceRule) {
          const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
          if (fam) families.add(fam);
        }
      }
    } catch {
      // Cross-origin stylesheets hide cssRules in some browsers — families
      // stay unknown but the fonts still work by name.
    }
  }
  return Array.from(families);
}

/**
 * Register an uploaded font file via the FontFace API.
 * Guesses weight/style from the filename so multiple files can share a family.
 */
export async function registerFontFile(file: File): Promise<FontOption> {
  const buf = await file.arrayBuffer();
  const base = file.name.replace(/\.(woff2?|otf|ttf)$/i, '');

  // "ProximaSera-Bold" → family "ProximaSera", weight 700
  const styleMatch = base.match(/[-_ ](thin|extralight|light|regular|book|medium|semibold|demibold|bold|extrabold|heavy|black|italic|oblique)+$/i);
  const family = (styleMatch ? base.slice(0, styleMatch.index) : base).replace(/[-_]+/g, ' ').trim() || base;
  const styleStr = (styleMatch?.[0] ?? '').toLowerCase();

  const weight =
    /thin/.test(styleStr) ? '100' :
    /extralight/.test(styleStr) ? '200' :
    /light/.test(styleStr) ? '300' :
    /medium/.test(styleStr) ? '500' :
    /semibold|demibold/.test(styleStr) ? '600' :
    /extrabold/.test(styleStr) ? '800' :
    /heavy|black/.test(styleStr) ? '900' :
    /bold/.test(styleStr) ? '700' : '400';
  const style = /italic|oblique/.test(styleStr) ? 'italic' : 'normal';

  const face = new FontFace(family, buf, { weight, style });
  await face.load();
  document.fonts.add(face);
  return { family, label: `${family} (uploaded)`, source: 'upload' };
}

/**
 * Ensure the families used by the doc are loaded at the weights the
 * renderer draws with, so canvas measurement is correct. Never throws —
 * missing fonts fall back to sans-serif.
 */
export async function ensureFontsReady(families: string[]): Promise<void> {
  const weights = ['300', '400', '500', '600', '700'];
  const loads: Promise<unknown>[] = [];
  for (const fam of families) {
    if (!fam.trim()) continue;
    for (const w of weights) {
      loads.push(document.fonts.load(`${w} 32px "${fam}"`).catch(() => []));
    }
    loads.push(document.fonts.load(`italic 400 32px "${fam}"`).catch(() => []));
  }
  await Promise.race([
    Promise.all(loads),
    new Promise((r) => setTimeout(r, 4000)), // don't hang exports on a dead kit
  ]);
}
