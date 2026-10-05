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

/** F0（ピッチ）。`data[k]` は時刻 k × hopSec の推定値（Hz、無声は 0） */
export interface Pitch {
  data: Float32Array
  hopSec: number
}

/** フォルマント。フレーム k の F(i+1) は `data[k * count + i]`（Hz、見つからなければ 0）。声のない区間は F0 で隠す */
export interface Formants {
  data: Float32Array
  /** 1 フレームあたりの数（F1〜F3 なら 3） */
  count: number
  hopSec: number
}

/** 解析の共通の指定 */
export interface AnalyzeOptions {
  /** 進み具合（0〜1） */
  onProgress?: (p: number) => void
  /** 中止する（Worker を止めて作り直す） */
  signal?: AbortSignal
}

/** Worker へ送るもの */
export interface AnalyzeRequest {
  id: number
  kind: 'spec' | 'f0' | 'formant'
  samples: Float32Array
  sampleRate: number
}

/** Worker から返るもの */
export type WorkerMessage = { id: number; progress: number } | { id: number; data: Uint8Array | Float32Array } | { id: number; error: string }
