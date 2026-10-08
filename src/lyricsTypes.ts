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

/** モデルの取得の大きさの目安（MB。WebGPU で使う量子化したもの） */
export const LYRICS_MODEL_MB: Record<LyricsModel, number> = { tiny: 40, base: 80, small: 250 }

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
  /** kuromoji の辞書のフォルダー（URL のパス。kuromoji は URL の // を潰すので、スキームを付けない） */
  dicPath: string
}

/** Worker から返るもの */
export type LyricsMessage =
  | { kind: 'download'; progress: number }
  | { kind: 'transcribe' }
  | { kind: 'done'; segments: LyricsSegment[] }
  | { kind: 'error'; error: string }
