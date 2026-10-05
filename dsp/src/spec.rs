//! スペクトログラム（表示用）。
//!
//! STFT の振幅を dB にし、対数周波数軸の `ROWS` 段に割り当てて 0〜255 に量子化する。
//! 表示専用なので精度より軽さを優先する。

use wevocal_lib::fft::Fft;
use wevocal_lib::window::hann;

/// 周波数軸の段数。
pub const ROWS: usize = 128;
/// 最低周波数（Hz）。最高はナイキスト周波数。
pub const MIN_HZ: f32 = 50.0;
/// フレーム長とホップ（サンプル）。
const FRAME: usize = 2048;
pub const HOP: usize = 256;
/// 表示する dB の範囲（これより小さい値は 0 になる）。
const RANGE_DB: f32 = 90.0;

/// モノラル信号 `x` のスペクトログラムを返す。フレーム k の段 r（0 が最低周波数）は
/// `out[k * ROWS + r]`。フレーム k の中心は時刻 k × HOP（サンプル）。
pub fn compute(x: &[f32], sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<u8> {
    if x.is_empty() {
        return Vec::new();
    }
    let n = FRAME;
    let bins = n / 2 + 1;
    let fft = Fft::new(n);
    let window: Vec<f32> = hann(n);
    // Hann 窓の振幅補正（フルスケールの正弦波がおよそ 0dB になる）。
    let ref_mag = n as f32 / 4.0;

    // 各段の中心周波数に対応する（小数の）ビン位置。
    let nyquist = sample_rate / 2.0;
    let row_bin: Vec<f32> = (0..ROWS)
        .map(|r| {
            let f = MIN_HZ * (nyquist / MIN_HZ).powf(r as f32 / (ROWS - 1) as f32);
            (f / sample_rate * n as f32).min((bins - 1) as f32)
        })
        .collect();

    let frames = x.len() / HOP + 1;
    let mut out = vec![0u8; frames * ROWS];
    let (mut re, mut im) = (vec![0.0f32; n], vec![0.0f32; n]);
    let mut mag = vec![0.0f32; bins];
    for k in 0..frames {
        if k % 1000 == 0 {
            progress(k as f64 / frames as f64);
        }
        let start = (k * HOP) as i64 - (n / 2) as i64;
        for i in 0..n {
            let s = start + i as i64;
            re[i] = if s >= 0 && (s as usize) < x.len() {
                x[s as usize] * window[i]
            } else {
                0.0
            };
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        for b in 0..bins {
            mag[b] = (re[b] * re[b] + im[b] * im[b]).sqrt();
        }
        let row = &mut out[k * ROWS..(k + 1) * ROWS];
        for (r, v) in row.iter_mut().enumerate() {
            // 隣の段との中間までのビンの最大値を取る（高域で細い倍音を取りこぼさない）。
            let lo = if r == 0 {
                row_bin[0]
            } else {
                (row_bin[r - 1] + row_bin[r]) / 2.0
            };
            let hi = if r + 1 == ROWS {
                row_bin[r]
            } else {
                (row_bin[r] + row_bin[r + 1]) / 2.0
            };
            let (a, b) = (
                lo.round() as usize,
                (hi.round() as usize).max(lo.round() as usize),
            );
            let m = if b > a {
                mag[a..=b.min(bins - 1)]
                    .iter()
                    .cloned()
                    .fold(0.0f32, f32::max)
            } else {
                // 低域では段がビンより細かいので線形補間する。
                let p = row_bin[r];
                let i = p.floor() as usize;
                let g = p - i as f32;
                mag[i] + (mag[(i + 1).min(bins - 1)] - mag[i]) * g
            };
            let db = 20.0 * (m / ref_mag + 1e-12).log10();
            *v = (((db + RANGE_DB) / RANGE_DB).clamp(0.0, 1.0) * 255.0).round() as u8;
        }
    }
    progress(1.0);
    out
}
