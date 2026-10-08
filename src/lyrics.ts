/**
 * 歌詞の文字化（Whisper）。transformers.js を使うので大きく、ライブラリの入口（index.ts）とは分け、
 * 追加機能 analyzer-lyrics として配る（Analyzer と WeVocalSynth の両方。vite.addons.lyrics.config.ts）。
 * 歌声は話し声より認識しにくいので、伴奏のある曲は先にボーカルを取り出す（WeVocalExtractor）とよい
 */
import type { Clip } from 'wevocal-lib'
import type { LyricsMessage, LyricsModel, LyricsRequest, LyricsSegment } from './lyricsTypes'

export { hasWebGpu, LYRICS_MODEL_MB, type LyricsModel, type LyricsSegment } from './lyricsTypes'

/** Whisper が受け付けるサンプルレート */
const WHISPER_RATE = 16000

export interface LyricsOptions {
  model: LyricsModel
  /** 計算に使うもの。CPU（wasm）はとても遅いので、画面では開発者向けの設定でだけ選べる */
  device: 'webgpu' | 'wasm'
  /** 言語（'japanese'、'english' など）。null なら自動で判定する */
  language: string | null
  /** モデルの取得の進み具合（0〜1） */
  onDownload?: (p: number) => void
  /** 取得が終わり、認識を始めたとき（認識の進み具合は分からない） */
  onTranscribe?: () => void
  signal?: AbortSignal
}

/** 全チャンネルを平均し、16kHz にする（ブラウザの OfflineAudioContext で変換する） */
async function toWhisperInput(clip: Clip): Promise<Float32Array> {
  const len = clip.channels[0]?.length ?? 0
  const mono = new Float32Array(len)
  for (const ch of clip.channels) for (let i = 0; i < len; i++) mono[i] += ch[i] / clip.channels.length
  if (clip.sampleRate === WHISPER_RATE) return mono
  const ctx = new OfflineAudioContext(1, Math.ceil((len * WHISPER_RATE) / clip.sampleRate), WHISPER_RATE)
  const buf = ctx.createBuffer(1, len, clip.sampleRate)
  buf.copyToChannel(mono, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  return (await ctx.startRendering()).getChannelData(0)
}

// 文字化の Worker（モデルを保持するので、使い回す。中止したら作り直す）
let worker: Worker | null = null

/** 歌詞を文字にする。区間ごとの時刻と文字を返す */
export async function transcribeLyrics(clip: Clip, o: LyricsOptions): Promise<LyricsSegment[]> {
  o.signal?.throwIfAborted()
  const samples = await toWhisperInput(clip)
  o.signal?.throwIfAborted()
  worker ??= new Worker(new URL('./lyricsWorker.ts', import.meta.url), { type: 'module' })
  const w = worker
  return new Promise((resolve, reject) => {
    const abort = () => {
      w.terminate()
      if (worker === w) worker = null
      reject(o.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    o.signal?.addEventListener('abort', abort, { once: true })
    const finish = () => o.signal?.removeEventListener('abort', abort)
    w.onmessage = (e: MessageEvent<LyricsMessage>) => {
      const m = e.data
      if (m.kind === 'download') return o.onDownload?.(m.progress)
      if (m.kind === 'transcribe') return o.onTranscribe?.()
      finish()
      if (m.kind === 'done') resolve(m.segments)
      else reject(new Error(m.error))
    }
    w.onerror = (e) => {
      finish()
      if (worker === w) worker = null
      reject(new Error(e.message || 'lyrics worker error'))
    }
    // 辞書は追加機能の dict/（index.js と同じ場所。vite.addons.lyrics.config.ts でコピーする）
    const dicPath = new URL('./dict/', import.meta.url).pathname
    // モデルは追加機能 whisper-<大きさ>（この追加機能の隣のフォルダー。scripts/whisperAddons.mjs）
    const modelBase = new URL(`../whisper-${o.model}/`, import.meta.url).href
    const req: LyricsRequest = { model: o.model, device: o.device, language: o.language, samples, dicPath, modelBase }
    w.postMessage(req, [samples.buffer])
  })
}
