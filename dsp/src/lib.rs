//! WeVocalAnalyzer の解析の計算（今はスペクトログラム）。FFT と窓関数は wevocal-lib のものを使う。
//! wasm では素の C ABI（`ffi`）で公開し、Worker から `WebAssembly.instantiate` で読み込む。

mod ffi;
pub mod spec;
