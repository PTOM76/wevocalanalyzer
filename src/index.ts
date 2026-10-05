/**
 * WeVocalAnalyzer: 声の解析（UI を持たず、React にも依存しない。画面は app/）。
 * WeVocalSynth からは追加機能として使う（今のところスペクトログラムだけ。docs/PLAN.md）。
 * 解析の API（`analyzeSpectrogram`、`analyzePitch`、`analyzeFormants`）はこれから足す
 */
export type { Clip } from 'wevocal-lib'

/** ライブラリの版（追加機能のマニフェストと合わせる） */
export const ANALYZER_VERSION = '0.1.0'
