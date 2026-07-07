/* ═══════════════════════════════════════════════════════
   Motion Studio — audio engine
   · Decode uploaded music files (and the audio track of
     uploaded video clips) to PCM for export mixing.
   · Mix the full soundtrack offline: background music with
     fade-in/out under everything, plus each video scene's
     own audio placed at its position on the timeline.
   · musicGainAt() is the single fade curve — the preview
     volume and the offline mix both use it, so what you
     hear is what exports.
   ═══════════════════════════════════════════════════════ */

import { MotionDoc, AudioMap, VideoMap, AudioAsset, docDuration } from './types';

const MIX_SAMPLE_RATE = 48000;
const MIX_CHANNELS = 2;

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext({ sampleRate: MIX_SAMPLE_RATE });
  return sharedCtx;
}

/** Decode any audio-bearing file (mp3/wav/m4a — or an mp4 video's audio track). */
export async function decodeAudio(buf: ArrayBuffer): Promise<AudioBuffer> {
  return getAudioContext().decodeAudioData(buf);
}

/** Decode a video file's audio track; null when silent or undecodable. */
export async function tryDecodeVideoAudio(buf: ArrayBuffer): Promise<AudioBuffer | null> {
  try {
    return await decodeAudio(buf);
  } catch {
    return null;
  }
}

/** Build an AudioAsset (decoded PCM + preview element) from an uploaded file. */
export async function loadAudioAsset(file: File): Promise<AudioAsset> {
  const arrayBuf = await file.arrayBuffer();
  const buffer = await decodeAudio(arrayBuf);
  const url = URL.createObjectURL(file);
  const element = new Audio(url);
  element.preload = 'auto';
  element.loop = true;
  return {
    id: `aud-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: file.name,
    url,
    buffer,
    element,
  };
}

/**
 * Music gain at global time t — linear fade-in from 0, hold at
 * doc.audioVolume, linear fade-out to 0 at the end. Fades are clamped
 * so they never overlap on very short documents.
 */
export function musicGainAt(doc: MotionDoc, tMs: number, totalMs: number, voDurMs = 0): number {
  const vol = Math.max(0, Math.min(1, doc.audioVolume));
  if (totalMs <= 0) return 0;
  const fadeIn = Math.max(0, Math.min(doc.audioFadeIn, totalMs / 2));
  const fadeOut = Math.max(0, Math.min(doc.audioFadeOut, totalMs / 2));
  let g = 1;
  if (fadeIn > 0 && tMs < fadeIn) g = Math.min(g, tMs / fadeIn);
  if (fadeOut > 0 && tMs > totalMs - fadeOut) g = Math.min(g, (totalMs - tMs) / fadeOut);
  return Math.max(0, Math.min(1, g)) * vol * duckGainAt(doc, tMs, voDurMs);
}

const DUCK_RAMP_MS = 300;

/**
 * Duck multiplier at global time t — 1 outside the voiceover window,
 * doc.audioDuckLevel while the VO plays, linear ramps either side.
 * voDurMs comes from the decoded VO buffer (0 = no VO loaded).
 */
export function duckGainAt(doc: MotionDoc, tMs: number, voDurMs: number): number {
  if (!doc.audioDuckOn || !doc.voId || voDurMs <= 0 || doc.voVolume <= 0) return 1;
  const lvl = Math.max(0, Math.min(1, doc.audioDuckLevel ?? 0.3));
  const s = doc.voStart;
  const e = doc.voStart + voDurMs;
  let duck = 0;
  if (tMs >= s && tMs <= e) duck = 1;
  else if (tMs > s - DUCK_RAMP_MS && tMs < s) duck = (tMs - (s - DUCK_RAMP_MS)) / DUCK_RAMP_MS;
  else if (tMs > e && tMs < e + DUCK_RAMP_MS) duck = 1 - (tMs - e) / DUCK_RAMP_MS;
  return 1 - duck * (1 - lvl);
}

/**
 * Render the document's full soundtrack to a PCM buffer:
 * looped background music with the fade envelope, plus every video
 * scene's own audio at its timeline position. Returns null when the
 * document has no audible sources (export then skips the audio track).
 */
export async function renderMixdown(
  doc: MotionDoc,
  audio: AudioMap,
  videos: VideoMap,
): Promise<AudioBuffer | null> {
  const totalMs = docDuration(doc);
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;

  const music = doc.audioId ? audio[doc.audioId] : null;
  const musicAudible = !!music && doc.audioVolume > 0;

  interface ClipSource { buffer: AudioBuffer; startS: number; offsetS: number; durS: number; gain: number }
  const clips: ClipSource[] = [];
  const addClip = (buffer: AudioBuffer | null, startMs: number, trimMs: number, durMs: number, gain: number) => {
    if (!buffer || gain <= 0) return;
    const offsetS = Math.min(trimMs / 1000, Math.max(0, buffer.duration - 0.01));
    const durS = Math.min(durMs / 1000, buffer.duration - offsetS);
    if (durS > 0) clips.push({ buffer, startS: startMs / 1000, offsetS, durS, gain });
  };

  let acc = 0;
  for (const scene of doc.scenes) {
    if (scene.template === 'video' && scene.videoId && !scene.videoMuted) {
      addClip(videos[scene.videoId]?.audioBuffer ?? null, acc, scene.videoTrimStart, scene.duration, scene.videoVolume);
    }
    // Coach-cam thumbnail audio (any template)
    if (scene.pipVideoId && !scene.pipMuted) {
      addClip(videos[scene.pipVideoId]?.audioBuffer ?? null, acc, scene.pipTrimStart, scene.duration, scene.pipVolume);
    }
    acc += scene.duration;
  }

  // Voiceover — plays once from voStart
  const vo = doc.voId ? audio[doc.voId] : null;
  if (vo && doc.voVolume > 0) {
    const startMs = Math.max(0, Math.min(doc.voStart, totalMs));
    addClip(vo.buffer, startMs, 0, totalMs - startMs, doc.voVolume);
  }

  if (!musicAudible && clips.length === 0) return null;

  const totalS = totalMs / 1000;
  const octx = new OfflineAudioContext(
    MIX_CHANNELS,
    Math.max(1, Math.ceil(totalS * MIX_SAMPLE_RATE)),
    MIX_SAMPLE_RATE,
  );

  if (musicAudible && music) {
    const src = octx.createBufferSource();
    src.buffer = music.buffer;
    src.loop = true;
    const gain = octx.createGain();
    // Piecewise-linear envelope matching musicGainAt()
    const fadeIn = Math.max(0, Math.min(doc.audioFadeIn, totalMs / 2)) / 1000;
    const fadeOut = Math.max(0, Math.min(doc.audioFadeOut, totalMs / 2)) / 1000;
    const vol = Math.max(0, Math.min(1, doc.audioVolume));
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : vol, 0);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(vol, fadeIn);
    if (fadeOut > 0) {
      gain.gain.setValueAtTime(vol, Math.max(fadeIn, totalS - fadeOut));
      gain.gain.linearRampToValueAtTime(0, totalS);
    }

    // Duck envelope multiplies the fade envelope via a second gain node
    // in series — same ramps duckGainAt() gives the preview.
    const voBuf = doc.voId ? audio[doc.voId]?.buffer : null;
    const duck = octx.createGain();
    duck.gain.value = 1;
    if (doc.audioDuckOn && voBuf && doc.voVolume > 0) {
      const lvl = Math.max(0, Math.min(1, doc.audioDuckLevel ?? 0.3));
      const ramp = DUCK_RAMP_MS / 1000;
      const s = Math.max(0, Math.min(doc.voStart, totalMs)) / 1000;
      const e = Math.min(s + voBuf.duration, totalS);
      duck.gain.setValueAtTime(1, Math.max(0, s - ramp));
      duck.gain.linearRampToValueAtTime(lvl, s);
      duck.gain.setValueAtTime(lvl, e);
      duck.gain.linearRampToValueAtTime(1, Math.min(totalS, e + ramp));
    }

    src.connect(gain).connect(duck).connect(octx.destination);
    src.start(0);
    src.stop(totalS);
  }

  for (const clip of clips) {
    const src = octx.createBufferSource();
    src.buffer = clip.buffer;
    const gain = octx.createGain();
    gain.gain.value = clip.gain;
    src.connect(gain).connect(octx.destination);
    src.start(clip.startS, clip.offsetS, clip.durS);
  }

  return octx.startRendering();
}
