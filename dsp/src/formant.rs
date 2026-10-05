//! フォルマント（F1〜F3）の推定（表示用）。
//!
//! 約 11kHz に間引き、プリエンファシスと窓を掛けたフレームの LPC（自己相関法、Levinson-Durbin）から
//! スペクトル包絡を求め、その山を低い方から `COUNT` 個取る。間隔は F0 と同じ `HOP_SEC`。
//! 有声か無声かは見ないので、表示する側が F0（無声は 0）で隠す。

use wevocal_lib::f0::HOP_SEC;
use wevocal_lib::resample;
use wevocal_lib::window::hann;

/// 取るフォルマントの数（F1〜F3）。
pub const COUNT: usize = 3;
/// 間引いたあとのサンプルレート（Hz）。F3 まで（約 3.5kHz）を含められる高さ。
const RATE: f32 = 11025.0;
/// フレーム長（秒）。
const FRAME_SEC: f32 = 0.025;
/// LPC の次数（間引いたサンプルレートの kHz ＋ 2 が目安）。
const ORDER: usize = 13;
/// 包絡を調べる周波数の点の数（0〜ナイキスト）。
const GRID: usize = 512;
/// これより低い山はフォルマントとみなさない（Hz）。
const MIN_HZ: f32 = 150.0;

/// モノラル信号 `x` のフォルマントを返す。フレーム k の F(i+1) は `out[k * COUNT + i]`（Hz、見つからなければ 0）。
/// フレーム k の中心は時刻 k × HOP_SEC。
pub fn estimate(x: &[f32], sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<f32> {
    if x.is_empty() {
        return Vec::new();
    }
    let ratio = (sample_rate / RATE) as f64;
    let y = if ratio > 1.0 {
        resample(x, ratio, (x.len() as f64 / ratio) as usize)
    } else {
        x.to_vec()
    };
    let sr = if ratio > 1.0 { RATE } else { sample_rate };
    let n = (FRAME_SEC * sr) as usize;
    let hop = HOP_SEC * sr;
    let window = hann(n);
    let frames = (x.len() as f32 / sample_rate / HOP_SEC) as usize + 1;
    let mut out = vec![0.0f32; frames * COUNT];
    // 包絡を調べる点ごとの cos / sin（e^{-jωk}）を先に作る
    let (cos, sin): (Vec<f32>, Vec<f32>) = (0..GRID * (ORDER + 1))
        .map(|i| {
            let (g, k) = (i / (ORDER + 1), i % (ORDER + 1));
            let w = std::f32::consts::PI * g as f32 / (GRID - 1) as f32 * k as f32;
            (w.cos(), w.sin())
        })
        .unzip();
    let mut frame = vec![0.0f32; n];
    let mut env = vec![0.0f32; GRID];
    for k in 0..frames {
        if k % 500 == 0 {
            progress(k as f64 / frames as f64);
        }
        let start = (k as f32 * hop) as i64 - (n / 2) as i64;
        // プリエンファシス（高域を持ち上げて、高いフォルマントも取れるようにする）と窓
        let mut prev = 0.0f32;
        for i in 0..n {
            let s = start + i as i64;
            let v = if s >= 0 && (s as usize) < y.len() { y[s as usize] } else { 0.0 };
            frame[i] = (v - 0.97 * prev) * window[i];
            prev = v;
        }
        let Some(a) = lpc(&frame) else { continue };
        // 包絡 1 / |A(e^{jω})|²（山の位置だけを見るので、大きさはそろえない）
        for (g, e) in env.iter_mut().enumerate() {
            let (mut re, mut im) = (0.0f32, 0.0f32);
            for (j, &c) in a.iter().enumerate() {
                re += c * cos[g * (ORDER + 1) + j];
                im -= c * sin[g * (ORDER + 1) + j];
            }
            *e = 1.0 / (re * re + im * im + 1e-12);
        }
        let mut found = 0;
        for g in 1..GRID - 1 {
            if env[g] > env[g - 1] && env[g] >= env[g + 1] {
                // 放物線で山の位置を細かくする
                let d = env[g - 1] - 2.0 * env[g] + env[g + 1];
                let off = if d != 0.0 { 0.5 * (env[g - 1] - env[g + 1]) / d } else { 0.0 };
                let hz = (g as f32 + off) / (GRID - 1) as f32 * sr / 2.0;
                if hz < MIN_HZ {
                    continue;
                }
                out[k * COUNT + found] = hz;
                found += 1;
                if found == COUNT {
                    break;
                }
            }
        }
    }
    progress(1.0);
    out
}

/// 自己相関法の LPC 係数 a[0..=ORDER]（a[0] = 1）。無音などで求まらなければ None。
fn lpc(x: &[f32]) -> Option<Vec<f32>> {
    let mut r = [0.0f64; ORDER + 1];
    for (lag, v) in r.iter_mut().enumerate() {
        *v = x[lag..].iter().zip(x).map(|(&a, &b)| a as f64 * b as f64).sum();
    }
    if r[0] < 1e-10 {
        return None;
    }
    // Levinson-Durbin
    let mut a = [0.0f64; ORDER + 1];
    a[0] = 1.0;
    let mut err = r[0];
    for i in 1..=ORDER {
        let acc: f64 = (1..i).map(|j| a[j] * r[i - j]).sum();
        let k = -(r[i] + acc) / err;
        let prev = a;
        for j in 1..i {
            a[j] = prev[j] + k * prev[i - j];
        }
        a[i] = k;
        err *= 1.0 - k * k;
        if err <= 0.0 {
            return None;
        }
    }
    Some(a.iter().map(|&v| v as f32).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 声の代わりに、決まった山（700Hz、1200Hz、2600Hz）を持つ音を作り、その近くに F1〜F3 が出ること。
    #[test]
    fn finds_resonances() {
        let sr = 44100.0;
        let len = (sr * 0.5) as usize;
        // 120Hz のパルス列を、3 つの共振（2 次の IIR）に順に通す
        let mut x: Vec<f32> = (0..len).map(|i| if i % (sr as usize / 120) == 0 { 1.0 } else { 0.0 }).collect();
        for (f, bw) in [(700.0f32, 80.0f32), (1200.0, 90.0), (2600.0, 120.0)] {
            let r = (-std::f32::consts::PI * bw / sr).exp();
            let c = 2.0 * r * (2.0 * std::f32::consts::PI * f / sr).cos();
            let (mut y1, mut y2) = (0.0f32, 0.0f32);
            for v in x.iter_mut() {
                let y = *v + c * y1 - r * r * y2;
                y2 = y1;
                y1 = y;
                *v = y;
            }
        }
        let peak = x.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        x.iter_mut().for_each(|v| *v /= peak);
        let out = estimate(&x, sr, &mut |_| {});
        let k = 25;
        let f = &out[k * COUNT..(k + 1) * COUNT];
        for (got, want) in f.iter().zip([700.0f32, 1200.0, 2600.0]) {
            assert!((got - want).abs() < want * 0.1, "got {f:?}");
        }
    }
}
