/** スペクトログラム（表示用）。フレーム k の段 r（0 が最低周波数）は `data[k * rows + r]`（0〜255） */
export interface Spectrogram {
  data: Uint8Array
  frames: number
  rows: number
  /** フレーム間隔（秒）。フレーム k の中心は k × hopSec */
  hopSec: number
  minHz: number
  maxHz: number
}

/** 解析の共通の指定 */
export interface AnalyzeOptions {
  /** 進み具合（0〜1） */
  onProgress?: (p: number) => void
  /** 中止する（Worker を止めて作り直す） */
  signal?: AbortSignal
}

/** Worker へ送るもの */
export interface SpecRequest {
  id: number
  samples: Float32Array
  sampleRate: number
}

/** Worker から返るもの */
export type WorkerMessage = { id: number; progress: number } | { id: number; data: Uint8Array } | { id: number; error: string }
