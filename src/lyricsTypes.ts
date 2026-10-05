/** Whisper のモデルの大きさ。大きいほど正確で、取得と計算に時間がかかる */
export type LyricsModel = 'tiny' | 'base' | 'small'

/** モデルの取得の大きさの目安（MB。WebGPU で使う量子化したもの） */
export const LYRICS_MODEL_MB: Record<LyricsModel, number> = { tiny: 40, base: 80, small: 250 }

/** 歌詞の 1 区間（時刻は秒） */
export interface LyricsSegment {
  start: number
  end: number
  text: string
}

/** Worker へ送るもの。`samples` は 16kHz のモノラル */
export interface LyricsRequest {
  model: LyricsModel
  device: 'webgpu' | 'wasm'
  /** 言語（transformers.js の名前。'japanese' など）。null なら自動で判定する */
  language: string | null
  samples: Float32Array
}

/** Worker から返るもの */
export type LyricsMessage =
  | { kind: 'download'; progress: number }
  | { kind: 'transcribe' }
  | { kind: 'done'; segments: LyricsSegment[] }
  | { kind: 'error'; error: string }
