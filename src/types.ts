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

/** フォルマント。フレーム k の F(i+1) は `data[k * count + i]`（Hz、見つからなければ 0）。無声区間は F0 で隠す */
export interface Formants {
  data: Float32Array
  /** 1 フレームあたりの数（F1〜F3 なら 3） */
  count: number
  hopSec: number
}

/** 強さ（RMS、dBFS）。`data[k]` は時刻 k × hopSec の値 */
export interface Level {
  data: Float32Array
  hopSec: number
}

/** スペクトログラムの設定 */
export interface SpectrogramOptions extends AnalyzeOptions {
  /** 窓の長さ（サンプル、2 のべき乗）。短いと時間の細かさ（広帯域）、長いと周波数の細かさ（狭帯域）。既定は 2048 */
  window?: number
}

/** F0 の設定 */
export interface PitchOptions extends AnalyzeOptions {
  /** 探す範囲（Hz）。既定は 60〜1000 */
  minHz?: number
  maxHz?: number
}

/** フォルマントの設定 */
export interface FormantOptions extends AnalyzeOptions {
  /** 最高周波数（Hz）。男声 5000、女声 5500 が目安。既定は 5500 */
  ceiling?: number
}

/** 解析の共通の指定 */
export interface AnalyzeOptions {
  /** 進み具合（0〜1） */
  onProgress?: (p: number) => void
  /** 中止する（Worker を止めて作り直す） */
  signal?: AbortSignal
}

/** 一音（秒。渡した音の先頭から） */
export interface MoraRange {
  start: number
  end: number
  /** 読み（ひらがな。きゃ のような 2 文字もある） */
  mora: string
  /** 境目がはっきりしているか（偽なら確認の画面で色を変える） */
  sure: boolean
  /** 中身が読みと合うか（偽なら、ほかの母音に近いか、長すぎていくつかの音が入っている） */
  vowelOk?: boolean
}

/** Worker へ送るもの */
export interface AnalyzeRequest {
  id: number
  kind: 'spec' | 'f0' | 'formant' | 'mora'
  /** 解析の設定（スペクトログラムの窓の長さ、F0 を探す範囲、フォルマントの最高周波数） */
  window?: number
  minHz?: number
  maxHz?: number
  ceiling?: number
  /** 一音ずつの印（mora のとき。reading.ts の moraCode） */
  codes?: number[]
  samples: Float32Array
  sampleRate: number
}

/** Worker から返るもの */
export type WorkerMessage = { id: number; progress: number } | { id: number; data: Uint8Array | Float32Array } | { id: number; error: string }
