'use client';

import ZebsMotionStudio from '@/components/motion/ZebsMotionStudio';

/* ═══════════════════════════════════════════════════════
   ZFIT Motion — the fitness training video editor for
   Zeb's Platinum Fitness. Upload Zeb's exercise clips,
   wrap them in the ZFIT series package (brand sting,
   series title, disclaimer, circuit index, module title,
   end card), lay text overlays with gradient fades over
   the footage, add a Zeb-cam lower third, music with
   fade-in, and a voiceover — then export MP4 with the
   full soundtrack. Everything runs in the browser.
   ═══════════════════════════════════════════════════════ */

export default function ZfitMotionPage() {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#000' }}>

      {/* Header */}
      <header
        style={{
          flexShrink: 0,
          height: 48,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(253,234,1,0.14)',
          background: '#0d0d0d',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="zebs-bolt" aria-hidden />
          <span
            style={{
              fontFamily: "'Futura', sans-serif",
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#fafafa',
            }}
          >
            ZFIT <span style={{ color: '#fdea01' }}>Motion</span>
          </span>
        </div>
        <span
          style={{
            fontFamily: "'Futura', sans-serif",
            fontWeight: 700,
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#fdea01',
          }}
        >
          Zeb&apos;s Platinum Fitness · The 10-Minute Series
        </span>
      </header>

      {/* Studio fills the rest */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ZebsMotionStudio />
      </div>
    </div>
  );
}
