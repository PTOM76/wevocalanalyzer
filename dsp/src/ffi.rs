//! wasm 向け C ABI。wasm-bindgen を使わず、Worker から素の `WebAssembly.instantiate` で呼べる関数だけを公開する。

use crate::{formant, mora, spec};
use wevocal_lib::f0;
use std::cell::RefCell;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    /// ホスト（Worker）が `env.report_progress` として提供する。
    fn report_progress(p: f64);
}

fn host_progress(p: f64) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        report_progress(p)
    };
    #[cfg(not(target_arch = "wasm32"))]
    let _ = p;
}

thread_local! {
    static OUTPUT: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static OUTPUT_U8: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// wasm メモリ上に f32 を `len` 個確保し、そのポインタを返す。
#[no_mangle]
pub extern "C" fn alloc_f32(len: usize) -> *mut f32 {
    let mut v = vec![0.0f32; len];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// `alloc_f32` で確保したメモリを解放する。
///
/// # Safety
/// `ptr`/`len` は1回の `alloc_f32` 呼び出しで得たものであること。
#[no_mangle]
pub unsafe extern "C" fn free_f32(ptr: *mut f32, len: usize) {
    drop(Vec::from_raw_parts(ptr, len, len));
}

/// モノラル音声のスペクトログラムを計算し、フレーム数を返す。結果（フレームごとに
/// `spec::ROWS` バイト）は `output_u8_ptr` で取得する。
///
/// # Safety
/// `input` は `frames` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn analyze_spectrogram(input: *const f32, frames: usize, sample_rate: f32, window: usize) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let out = spec::compute(x, sample_rate, window, &mut host_progress);
    let n = out.len() / spec::ROWS;
    OUTPUT_U8.with(|o| *o.borrow_mut() = out);
    n
}

/// モノラル音声の F0 を推定し、値の個数を返す（`f0::HOP_SEC` 間隔、Hz、無声は 0）。結果は `output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn analyze_f0(input: *const f32, frames: usize, sample_rate: f32, min_hz: f32, max_hz: f32) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let params = f0::Params { min_hz, max_hz, ..Default::default() };
    let out = f0::estimate_with(x, sample_rate, &params, &mut host_progress);
    let n = out.len();
    OUTPUT.with(|o| *o.borrow_mut() = out);
    n
}

/// モノラル音声のフォルマントを推定し、値の個数（フレーム数 × `formant::COUNT`）を返す。結果は `output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn analyze_formants(input: *const f32, frames: usize, sample_rate: f32, ceiling: f32) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let out = formant::estimate(x, sample_rate, ceiling, &mut host_progress);
    let n = out.len();
    OUTPUT.with(|o| *o.borrow_mut() = out);
    n
}

/// モノラル音声（歌の 1 区間）を一音ずつに分け、音の数を返す。`codes` は一音ずつの印（`mora::VOWEL_MASK` などの値を f32 にしたもの）。
/// 結果は音ごとに 4 つ（始まり、終わり（秒）、確かか 1/0、母音が合うか 1/0）で、`output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames` 個、`codes` は `count` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn segment_morae(input: *const f32, frames: usize, sample_rate: f32, codes: *const f32, count: usize) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let c: Vec<u8> = std::slice::from_raw_parts(codes, count).iter().map(|&v| v as u8).collect();
    let out = mora::segment(x, sample_rate, &c);
    let n = out.len();
    OUTPUT.with(|o| *o.borrow_mut() = out.iter().flat_map(|m| [m.start, m.end, if m.sure { 1.0 } else { 0.0 }, if m.vowel_ok { 1.0 } else { 0.0 }]).collect());
    n
}

/// 直前の結果（f32）の先頭。
#[no_mangle]
pub extern "C" fn output_ptr() -> *const f32 {
    OUTPUT.with(|o| o.borrow().as_ptr())
}

/// 直前の結果（u8）の先頭。
#[no_mangle]
pub extern "C" fn output_u8_ptr() -> *const u8 {
    OUTPUT_U8.with(|o| o.borrow().as_ptr())
}
