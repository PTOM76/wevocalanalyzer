// 追加機能を読み込む前の画面（モデルの選択、WebGPU の確認）からも使うので、transformers.js を読まない

/** この環境で WebGPU を使えるか（アダプターを取れるか） */
export async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return !!(await gpu.requestAdapter())
  } catch {
    return false
  }
}

/** Whisper のモデルの大きさ。大きいほど正確で、取得と計算に時間がかかる */
export type LyricsModel = 'tiny' | 'base' | 'small'

/** モデルの取得の大きさの目安（MB。WebGPU で使うもの。追加機能 whisper-<大きさ> の合計） */
export const LYRICS_MODEL_MB: Record<LyricsModel, number> = { tiny: 120, base: 200, small: 560 }

/** 歌詞の 1 区間（時刻は秒） */
export interface LyricsSegment {
  start: number
  end: number
  text: string
  /** 読み（ひらがな）。日本語の区間だけ（kuromoji。reading.ts）。利用者が直すこともある */
  reading?: string
}

/** Worker へ送るもの。`samples` は 16kHz のモノラル */
export interface LyricsRequest {
  model: LyricsModel
  device: 'webgpu' | 'wasm'
  /** 言語（transformers.js の名前。'japanese' など）。null なら自動で判定する */
  language: string | null
  samples: Float32Array
  /** CPU（wasm）で使うスレッドの数（0 は自動。`lyricsThreads`） */
  threads: number
  /** kuromoji の辞書のフォルダー（URL のパス。kuromoji は URL の // を潰すので、スキームを付けない） */
  dicPath: string
  /** モデルの追加機能（whisper-<大きさ>）の場所。この下の onnx-community/whisper-<大きさ>/ から読む */
  modelBase: string
  /** Service Worker が動いていて、追加機能の保存先から読めるか（開発サーバーなどでは偽） */
  fromAddon: boolean
}

/** Worker から返るもの */
export type LyricsMessage =
  | { kind: 'download'; progress: number }
  | { kind: 'transcribe' }
  | { kind: 'done'; segments: LyricsSegment[] }
  | { kind: 'error'; error: string }

/**
 * CPU（wasm）で使うスレッドの数。cross-origin isolation でなければ 1。0（自動）は 4 と（コアの数 − 1）の小さい方で、iOS は 1。
 * 明示しないと、isolation のとき ONNX Runtime が自分で増やす（WeVocalExtractor の resolveThreads と同じ決め方）
 */
export function lyricsThreads(threads = 0): number {
  if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) return 1
  if (threads > 0) return threads
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  return ios ? 1 : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 1) - 1))
}
