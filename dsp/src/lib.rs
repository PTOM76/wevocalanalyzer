//! WeVocalAnalyzer の解析の計算（スペクトログラム、F0、フォルマント、一音ずつの境目）。FFT、窓関数、F0 推定、リサンプルは wevocal-lib のものを使う。
//! wasm では素の C ABI（`ffi`）で公開し、Worker から `WebAssembly.instantiate` で読み込む。

mod ffi;
pub mod formant;
pub mod mora;
pub mod spec;
