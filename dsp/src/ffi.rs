//! wasm 向け C ABI。wasm-bindgen を使わず、Worker から素の `WebAssembly.instantiate` で呼べる関数だけを公開する。

use crate::spec;
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
pub unsafe extern "C" fn analyze_spectrogram(input: *const f32, frames: usize, sample_rate: f32) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let out = spec::compute(x, sample_rate, &mut host_progress);
    let n = out.len() / spec::ROWS;
    OUTPUT_U8.with(|o| *o.borrow_mut() = out);
    n
}

/// 直前の結果（u8）の先頭。
#[no_mangle]
pub extern "C" fn output_u8_ptr() -> *const u8 {
    OUTPUT_U8.with(|o| o.borrow().as_ptr())
}
