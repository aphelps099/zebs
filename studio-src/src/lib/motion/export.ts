/* ═══════════════════════════════════════════════════════
   Motion Studio — video export
   · MP4: offline frame-by-frame render → WebCodecs H.264
     → mp4-muxer. Deterministic, faster than realtime,
     no dropped frames.
   · WebM fallback: realtime canvas.captureStream +
     MediaRecorder for browsers without WebCodecs.
   · PNG: single-frame snapshot.
   ═══════════════════════════════════════════════════════ */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { MotionDoc, AssetMap, VideoMap, Scene, getAspect, docDuration, sceneAt } from './types';
import { renderFrame, TRANS_MS } from './render';

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  /** 0–1 */
  ratio: number;
}

export type ProgressFn = (p: ExportProgress) => void;

export interface ExportOptions {
  /** Uploaded clips (video scenes). Frames are seeked exactly per export frame. */
  videos?: VideoMap;
  /** Pre-mixed soundtrack (see audio.ts renderMixdown). Null/undefined → silent MP4. */
  audioBuffer?: AudioBuffer | null;
}

export function supportsMp4Export(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window;
}

type MuxVideoCodec = 'avc' | 'vp9' | 'av1';

/**
 * Pick a supported encoder for MP4 output. Prefers H.264 (plays
 * everywhere); falls back to VP9/AV1 in an MP4 container on
 * browsers without an H.264 encoder.
 */
async function pickCodec(
  width: number, height: number, fps: number, bitrate: number,
): Promise<{ codec: string; mux: MuxVideoCodec }> {
  const candidates: { codec: string; mux: MuxVideoCodec }[] = [
    // High → Main → Baseline, level 4.2 covers 1080p60
    { codec: 'avc1.64002a', mux: 'avc' },
    { codec: 'avc1.4d402a', mux: 'avc' },
    { codec: 'avc1.42002a', mux: 'avc' },
    { codec: 'avc1.640028', mux: 'avc' },
    { codec: 'avc1.4d0028', mux: 'avc' },
    { codec: 'vp09.00.41.08', mux: 'vp9' },
    { codec: 'vp09.00.10.08', mux: 'vp9' },
    { codec: 'av01.0.08M.08', mux: 'av1' },
  ];
  for (const c of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec: c.codec, width, height, framerate: fps, bitrate,
      });
      if (supported) return c;
    } catch {
      // try next
    }
  }
  throw new Error('No supported video encoder found in this browser');
}

type MuxAudioCodec = 'aac' | 'opus';

/** Pick a supported audio encoder — AAC preferred, Opus-in-MP4 fallback. */
async function pickAudioCodec(
  sampleRate: number, numberOfChannels: number,
): Promise<{ codec: string; mux: MuxAudioCodec; bitrate: number }> {
  const candidates: { codec: string; mux: MuxAudioCodec; bitrate: number }[] = [
    { codec: 'mp4a.40.2', mux: 'aac', bitrate: 192_000 },
    { codec: 'opus', mux: 'opus', bitrate: 128_000 },
  ];
  for (const c of candidates) {
    try {
      const { supported } = await AudioEncoder.isConfigSupported({
        codec: c.codec, sampleRate, numberOfChannels, bitrate: c.bitrate,
      });
      if (supported) return c;
    } catch {
      // try next
    }
  }
  throw new Error('No supported audio encoder found in this browser');
}

/** Seek a video element and resolve once the frame is actually presented. */
function seekVideo(video: HTMLVideoElement, timeS: number): Promise<void> {
  const target = Math.max(0, Math.min(timeS, Math.max(0, (video.duration || timeS) - 0.001)));
  if (Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    video.currentTime = target;
    // Safety net — a stalled decoder shouldn't hang the whole export
    setTimeout(finish, 2000);
  });
}

/**
 * Park every video element on the exact frame the renderer will draw at
 * global time t: the active scene's clip, and — during a transition —
 * the previous scene's clip at its final frame.
 */
async function syncVideosForFrame(doc: MotionDoc, t: number, videos: VideoMap): Promise<void> {
  const { index, local } = sceneAt(doc, t);
  const jobs: Promise<void>[] = [];

  const queue = (scene: Scene | null, sceneLocal: number) => {
    if (!scene) return;
    if (scene.template === 'video' && scene.videoId) {
      const v = videos[scene.videoId];
      if (v) jobs.push(seekVideo(v.video, (scene.videoTrimStart + sceneLocal) / 1000));
    }
    if (scene.pipVideoId) {
      const pv = videos[scene.pipVideoId];
      if (pv) jobs.push(seekVideo(pv.video, (scene.pipTrimStart + sceneLocal) / 1000));
    }
  };

  const scene = doc.scenes[index];
  queue(scene, local);
  if (index > 0 && scene.transition !== 'cut' && local < TRANS_MS) {
    const prev = doc.scenes[index - 1];
    queue(prev, prev.duration);
  }
  if (jobs.length) await Promise.all(jobs);
}

/** Encode a mixed PCM buffer into the muxer as the MP4's audio track. */
async function encodeAudioTrack(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
  codec: string,
  bitrate: number,
  signal?: AbortSignal,
): Promise<void> {
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;

  let encodeError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { encodeError = e instanceof Error ? e : new Error(String(e)); },
  });
  encoder.configure({ codec, sampleRate, numberOfChannels: channels, bitrate });

  const CHUNK = 9600; // 200ms at 48k per AudioData
  const scratch = new Float32Array(CHUNK * channels);
  try {
    for (let offset = 0; offset < buffer.length; offset += CHUNK) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (encodeError) throw encodeError;
      const frames = Math.min(CHUNK, buffer.length - offset);
      const data = frames === CHUNK ? scratch : new Float32Array(frames * channels);
      for (let ch = 0; ch < channels; ch++) {
        buffer.copyFromChannel(data.subarray(ch * frames, (ch + 1) * frames), ch, offset);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: Math.round((offset / sampleRate) * 1e6),
        data,
      });
      encoder.encode(audioData);
      audioData.close();
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/**
 * Render the full document to an MP4 blob.
 * Renders every frame offline at full resolution — output is exactly
 * what the preview shows, regardless of machine speed.
 */
export async function exportMp4(
  doc: MotionDoc,
  assets: AssetMap,
  onProgress: ProgressFn,
  signal?: AbortSignal,
  opts: ExportOptions = {},
): Promise<Blob> {
  const { w: width, h: height } = getAspect(doc.aspect);
  const fps = doc.fps;
  const durationMs = docDuration(doc);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Timeline has no length — check scene durations');
  }
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const bitrate = Math.round(width * height * fps * 0.14); // ~9 Mbps at 1080p30
  const videos = opts.videos ?? {};
  const audioBuffer = opts.audioBuffer ?? null;

  const { codec, mux } = await pickCodec(width, height, fps, bitrate);
  const audioCodec = audioBuffer
    ? await pickAudioCodec(audioBuffer.sampleRate, audioBuffer.numberOfChannels)
    : null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: mux, width, height },
    ...(audioBuffer && audioCodec
      ? {
          audio: {
            codec: audioCodec.mux,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels,
          },
        }
      : {}),
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e instanceof Error ? e : new Error(String(e)); },
  });
  encoder.configure({ codec, width, height, framerate: fps, bitrate });

  const microTick = () => new Promise((r) => setTimeout(r, 0));

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (encodeError) throw encodeError;

      const t = (i / fps) * 1000;
      await syncVideosForFrame(doc, t, videos);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderFrame(ctx, doc, t, assets, videos);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // Keep the encoder queue bounded and the UI responsive
      if (encoder.encodeQueueSize > 8) {
        while (encoder.encodeQueueSize > 2) await microTick();
      }
      if (i % 3 === 0) {
        onProgress({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames });
        await microTick();
      }
    }

    await encoder.flush();
    if (encodeError) throw encodeError;

    if (audioBuffer && audioCodec) {
      await encodeAudioTrack(muxer, audioBuffer, audioCodec.codec, audioCodec.bitrate, signal);
    }

    muxer.finalize();
    onProgress({ frame: totalFrames, totalFrames, ratio: 1 });
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/**
 * Realtime WebM fallback for browsers without WebCodecs.
 * Plays the timeline once into a MediaRecorder.
 */
export async function exportWebm(
  doc: MotionDoc,
  assets: AssetMap,
  onProgress: ProgressFn,
  signal?: AbortSignal,
  opts: ExportOptions = {},
): Promise<Blob> {
  const videos = opts.videos ?? {};
  const { w: width, h: height } = getAspect(doc.aspect);
  const fps = doc.fps;
  const durationMs = docDuration(doc);
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

  const stream = canvas.captureStream(fps);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.round(width * height * fps * 0.12),
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.onerror = () => reject(new Error('MediaRecorder failed'));
    recorder.start(250);

    const t0 = performance.now();
    const tick = () => {
      if (signal?.aborted) {
        recorder.stop();
        reject(new DOMException('Export cancelled', 'AbortError'));
        return;
      }
      const elapsed = performance.now() - t0;
      const t = Math.min(elapsed, durationMs);
      // Realtime fallback: nudge video clips toward the frame time without
      // awaiting the seek — close enough for the WebM fallback path.
      const { index, local } = sceneAt(doc, t);
      const active = doc.scenes[index];
      if (active?.template === 'video' && active.videoId && videos[active.videoId]) {
        const v = videos[active.videoId].video;
        const targetS = (active.videoTrimStart + local) / 1000;
        if (Math.abs(v.currentTime - targetS) > 0.2) v.currentTime = targetS;
      }
      renderFrame(ctx, doc, t, assets, videos);
      onProgress({
        frame: Math.min(totalFrames, Math.round((t / 1000) * fps)),
        totalFrames,
        ratio: t / durationMs,
      });
      if (elapsed >= durationMs + 120) {
        recorder.stop();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Snapshot the frame at time t as a PNG blob. */
export async function exportPng(
  doc: MotionDoc, assets: AssetMap, t: number, opts: ExportOptions = {},
): Promise<Blob> {
  const { w: width, h: height } = getAspect(doc.aspect);
  const videos = opts.videos ?? {};
  await syncVideosForFrame(doc, t, videos);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  renderFrame(ctx, doc, t, assets, videos);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
