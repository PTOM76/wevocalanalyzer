//! 歌の 1 区間を、読みの一音（モーラ）ずつに分ける。
//!
//! 10ms ごとに、強さ、有声か、高い帯域の割合、スペクトルの変わり方、フォルマント（F1、F2）を出し、
//! 境目らしさの点数と、一音ごとの母音の合い方から、動的計画法で n 個に分ける並びを選ぶ。

use crate::formant;
use wevocal_lib::f0::{self, HOP_SEC};
use wevocal_lib::fft::Fft;
use wevocal_lib::window::hann;

/// 一音の印（下位 3 ビットが母音、その上が子音の種類）。reading.ts の `moraCode` と一致させる
pub const VOWEL_MASK: u8 = 7;
pub const N: u8 = 5; // ん
pub const Q: u8 = 6; // っ
pub const LONG: u8 = 7; // ー
pub const CONSONANT_SHIFT: u8 = 3;
/// 子音の種類（印の上位）
pub const C_NONE: u8 = 0;
pub const C_PLOSIVE: u8 = 1;
pub const C_FRICATIVE: u8 = 2;
pub const C_NASAL: u8 = 3;

/// 一音の最短（フレーム）
const MIN_FRAMES: usize = 4;
/// 一音の最長（フレーム）。平均の MAX_LEN_RATIO 倍か、これの大きいほう。上限がないと計算が区間の長さの 2 乗で増え、無音や隣の音まで一音に入りやすい
const MAX_FRAMES: usize = 300;
const MAX_LEN_RATIO: f32 = 4.0;
/// 声のある所とみなす強さ（区間の最大から dB）
const ACTIVE_DB: f32 = 35.0;
/// FFT の大きさ（特徴を出すとき）
const N_FFT: usize = 1024;
/// 高い帯域の境（Hz）
const HIGH_HZ: f32 = 3000.0;
/// 長さのばらつきの重み（平均との比の対数の 2 乗に掛ける。歌は音の長さが大きく違うので弱くする）
const LENGTH_WEIGHT: f32 = 0.15;
/// 母音が違うとみなす差（読みの母音との距離と、一番近い母音との距離の差）
const WRONG_VOWEL_MARGIN: f32 = 1.0;
/// 区間の平均のこれだけ倍より長い音は、いくつかの音が入っているとみなす
const TOO_LONG_RATIO: f32 = 3.0;
/// 母音の合い方の重み
const VOWEL_WEIGHT: f32 = 0.8;

/// 母音（あいうえお）の F1、F2 の目安（Hz。大人の平均。声道の長さの違いは対数で見るので、多少ずれても点は残る）
const VOWEL_FORMANTS: [(f32, f32); 5] = [(800.0, 1250.0), (320.0, 2300.0), (360.0, 1350.0), (500.0, 1900.0), (500.0, 900.0)];

/// 分けた一音（秒。入力の先頭から）
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Mora {
    pub start: f32,
    pub end: f32,
    /// 境目がはっきりしているか（偽なら確認の画面で色を変える）
    pub sure: bool,
    /// 母音が読みと合うか（偽なら、ほかの母音のほうがはっきり近い。い の所に え が入ったものなど）
    pub vowel_ok: bool,
}

/// 10ms ごとの特徴
struct Features {
    db: Vec<f32>,
    voiced: Vec<bool>,
    high: Vec<f32>,
    flux: Vec<f32>,
    f1: Vec<f32>,
    f2: Vec<f32>,
}

fn features(x: &[f32], sample_rate: f32) -> Features {
    let f0 = f0::estimate(x, sample_rate, &mut |_| {});
    let n = f0.len();
    let fm = formant::estimate(x, sample_rate, formant::DEFAULT_CEILING, &mut |_| {});
    let win = hann(N_FFT);
    let fft = Fft::new(N_FFT);
    let (mut re, mut im) = (vec![0.0f32; N_FFT], vec![0.0f32; N_FFT]);
    let bins = N_FFT / 2 + 1;
    let high_bin = ((HIGH_HZ / sample_rate) * N_FFT as f32) as usize;
    // スペクトルの変わり方は、対数の周波数で 24 帯にまとめた強さ（dB）の差で見る
    let bands: Vec<usize> = (0..=24).map(|i| ((100.0 * (80.0f32).powf(i as f32 / 24.0)) / sample_rate * N_FFT as f32).min(bins as f32 - 1.0) as usize).collect();
    let mut prev = vec![0.0f32; 24];
    let mut f = Features { db: vec![0.0; n], voiced: vec![false; n], high: vec![0.0; n], flux: vec![0.0; n], f1: vec![0.0; n], f2: vec![0.0; n] };
    for k in 0..n {
        let center = (k as f32 * HOP_SEC * sample_rate) as isize;
        for i in 0..N_FFT {
            let at = center - (N_FFT / 2) as isize + i as isize;
            re[i] = if at >= 0 { x.get(at as usize).copied().unwrap_or(0.0) * win[i] } else { 0.0 };
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        let p: Vec<f32> = (0..bins).map(|b| re[b] * re[b] + im[b] * im[b]).collect();
        let total: f32 = p.iter().sum::<f32>() + 1e-12;
        f.db[k] = 10.0 * (total / N_FFT as f32).log10();
        f.high[k] = p[high_bin.min(bins - 1)..].iter().sum::<f32>() / total;
        let mut flux = 0.0;
        for b in 0..24 {
            let e = 10.0 * (p[bands[b]..=bands[b + 1].max(bands[b])].iter().sum::<f32>() + 1e-10).log10();
            if k > 0 {
                flux += (e - prev[b]).abs();
            }
            prev[b] = e;
        }
        f.flux[k] = flux / 24.0;
        f.voiced[k] = f0[k] > 0.0;
        f.f1[k] = fm.get(k * formant::COUNT).copied().unwrap_or(0.0);
        f.f2[k] = fm.get(k * formant::COUNT + 1).copied().unwrap_or(0.0);
    }
    f
}

/// 中央値（空なら 0）
fn median(mut v: Vec<f32>) -> f32 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    v[v.len() / 2]
}

/// フレーム k が境目らしい度合い（0〜おおよそ 1）
fn boundary_scores(f: &Features) -> Vec<f32> {
    let n = f.db.len();
    let flux_med = median(f.flux.clone()).max(1e-3);
    (0..n)
        .map(|k| {
            // 強さの谷: 前後 60ms の最大より何 dB 低いか
            let lo = k.saturating_sub(6);
            let hi = (k + 7).min(n);
            let peak = f.db[lo..hi].iter().cloned().fold(f32::MIN, f32::max);
            let dip = ((peak - f.db[k]) / 20.0).clamp(0.0, 1.0);
            // 有声と無声の切り替わり
            let voicing = if k > 0 && f.voiced[k] != f.voiced[k - 1] { 1.0 } else { 0.0 };
            // 高い帯域が増える（子音の始まり）
            let high = if k >= 2 { ((f.high[k] - f.high[k - 2]) * 3.0).clamp(0.0, 1.0) } else { 0.0 };
            let flux = ((f.flux[k] / flux_med - 1.0) / 3.0).clamp(0.0, 1.0);
            0.4 * dip + 0.3 * voicing + 0.3 * high + 0.4 * flux
        })
        .collect()
}

/// 一音の合い方をすぐ求めるための累積和（強さ、母音を見られるフレームの数、F1、F2 の対数）
struct Sums {
    db: Vec<f32>,
    voiced: Vec<f32>,
    f1: Vec<f32>,
    f2: Vec<f32>,
}

impl Sums {
    fn new(f: &Features) -> Self {
        let n = f.db.len();
        let mut s = Sums { db: vec![0.0; n + 1], voiced: vec![0.0; n + 1], f1: vec![0.0; n + 1], f2: vec![0.0; n + 1] };
        for k in 0..n {
            let ok = f.voiced[k] && f.f1[k] > 0.0 && f.f2[k] > 0.0;
            s.db[k + 1] = s.db[k] + f.db[k];
            s.voiced[k + 1] = s.voiced[k] + if ok { 1.0 } else { 0.0 };
            s.f1[k + 1] = s.f1[k] + if ok { f.f1[k].log2() } else { 0.0 };
            s.f2[k + 1] = s.f2[k] + if ok { f.f2[k].log2() } else { 0.0 };
        }
        s
    }
}

/// フレーム `a..b` の後半の F1、F2 と、母音 `target`（0〜4）の目安との距離。母音を見られるフレームがなければ None
fn vowel_dist(s: &Sums, a: usize, b: usize, target: usize) -> Option<f32> {
    part_dist(s, a + (b - a) * 2 / 5, b, target)
}

/// フレーム `tail..b` の F1、F2 と、母音 `target` の目安との距離
fn part_dist(s: &Sums, tail: usize, b: usize, target: usize) -> Option<f32> {
    let voiced = s.voiced[b] - s.voiced[tail];
    if voiced < 1.0 {
        return None;
    }
    // F1、F2 は対数の平均（オクターブ）で見る。F2 は個人差が大きいので甘くする
    let l1 = (s.f1[b] - s.f1[tail]) / voiced;
    let l2 = (s.f2[b] - s.f2[tail]) / voiced;
    let (t1, t2) = VOWEL_FORMANTS[target];
    Some(((l1 - t1.log2()) / 0.5).powi(2) + ((l2 - t2.log2()) / 0.7).powi(2))
}

/// フレーム `a..b` の母音が、読みの母音 `target` よりほかの母音にはっきり近いか。
/// 中ほどと終わりを別々に見る（え の所に ね、ー、い まで入ったものは、終わりが い になる）
fn wrong_vowel(s: &Sums, a: usize, b: usize, target: u8) -> bool {
    if target > 4 {
        return false;
    }
    let third = (b - a) / 3;
    [(a + third, a + 2 * third), (a + 2 * third, b)].iter().any(|&(lo, hi)| {
        if hi <= lo {
            return false;
        }
        let Some(d) = part_dist(s, lo, hi, target as usize) else { return false };
        let best = (0..5).filter_map(|v| part_dist(s, lo, hi, v)).fold(f32::MAX, f32::min);
        d - best > WRONG_VOWEL_MARGIN
    })
}

/// フレーム `a..b` が、印 `code` の一音にどれだけ合うか（0〜1）。`prev_vowel` は前の音の母音（ー のため）
fn mora_fit(s: &Sums, a: usize, b: usize, code: u8, prev_vowel: u8, loud: f32) -> f32 {
    let vowel = code & VOWEL_MASK;
    // 母音は一音の後半（子音を除いた所）で見る
    let tail = a + (b - a) * 2 / 5;
    let voiced = s.voiced[b] - s.voiced[tail];
    let ratio = voiced / (b - tail) as f32;
    let mean_db = (s.db[b] - s.db[a]) / (b - a) as f32;
    match vowel {
        // っ: 弱いか無声
        Q => ((loud - mean_db) / 25.0).clamp(0.0, 1.0).max(1.0 - ratio),
        // ん: 有声で、やや弱い（鼻に抜ける）
        N => ratio * (0.5 + ((loud - mean_db) / 20.0).clamp(0.0, 0.5)),
        _ => {
            let target = if vowel == LONG { prev_vowel } else { vowel };
            if target > 4 {
                return 0.3;
            }
            vowel_dist(s, a, b, target as usize).map_or(0.3, |d| (-d).exp())
        }
    }
}

/// 声のある所（区間の最大から ACTIVE_DB 以内）の最初と最後のフレーム
fn active_range(db: &[f32]) -> Option<(usize, usize)> {
    let max = db.iter().cloned().fold(f32::MIN, f32::max);
    let first = db.iter().position(|&d| d > max - ACTIVE_DB)?;
    let last = db.iter().rposition(|&d| d > max - ACTIVE_DB)?;
    (last + 1 - first >= MIN_FRAMES).then_some((first, last + 1))
}

/// モノラル信号 `x`（1 区間。前後に少し余白があってよい）を、印 `codes` の一音ずつに分ける
pub fn segment(x: &[f32], sample_rate: f32, codes: &[u8]) -> Vec<Mora> {
    let n = codes.len();
    if n == 0 || x.is_empty() {
        return Vec::new();
    }
    let f = features(x, sample_rate);
    let Some((s, e)) = active_range(&f.db) else {
        return Vec::new();
    };
    let to_sec = |k: usize| k as f32 * HOP_SEC;
    // 分けきれないときは均等に分け、確かでない印を付ける
    if e - s < n * MIN_FRAMES {
        let len = (e - s) as f32 / n as f32;
        return (0..n).map(|i| Mora { start: to_sec(s) + to_sec(1) * len * i as f32, end: to_sec(s) + to_sec(1) * len * (i + 1) as f32, sure: false, vowel_ok: true }).collect();
    }
    let score = boundary_scores(&f);
    let loud = median(f.db[s..e].to_vec());
    let avg = (e - s) as f32 / n as f32;
    // 母音の前の音（ー のため）。ー が続くときは、さらに前のもの
    let mut prev_vowel = vec![0u8; n];
    for i in 1..n {
        let v = codes[i - 1] & VOWEL_MASK;
        prev_vowel[i] = if v == LONG { prev_vowel[i - 1] } else { v };
    }
    // 子音がなく、前と同じ母音の音（ね の後の え、ー）。音の境目がないので、境目の点は数えず、長さで分ける
    let held: Vec<bool> = (0..n)
        .map(|i| {
            let v = codes[i] & VOWEL_MASK;
            i > 0 && (v == LONG || (codes[i] >> CONSONANT_SHIFT == C_NONE && v <= 4 && v == prev_vowel[i]))
        })
        .collect();
    // best[i][k]: i 個の音を s..k に収めたときの一番よい点。from に一つ前の境目を覚える
    let width = e - s + 1;
    let mut best = vec![f32::NEG_INFINITY; (n + 1) * width];
    let mut from = vec![0usize; (n + 1) * width];
    best[0] = 0.0;
    let sums = Sums::new(&f);
    // 全体が n 個の最長に収まらないときは、収まるまで広げる
    let max_len = MAX_FRAMES.max((avg * MAX_LEN_RATIO) as usize).max((width - 1).div_ceil(n) + 1).min(width);
    for i in 1..=n {
        for k in (i * MIN_FRAMES)..width {
            // 残りの音が入る余地を残す
            if width - 1 - k < (n - i) * MIN_FRAMES {
                break;
            }
            let lo = k.saturating_sub(max_len).max((i - 1) * MIN_FRAMES);
            for j in lo..=(k - MIN_FRAMES) {
                let prev = best[(i - 1) * width + j];
                if prev == f32::NEG_INFINITY {
                    continue;
                }
                let len = (k - j) as f32;
                let length_cost = LENGTH_WEIGHT * (len / avg).ln().powi(2);
                let fit = VOWEL_WEIGHT * mora_fit(&sums, s + j, s + k, codes[i - 1], prev_vowel[i - 1], loud);
                // 境目の点（最初の音の始まりは区間の端なので数えない）
                let edge = if i > 1 && !held[i - 1] { score[s + j] } else { 0.0 };
                let v = prev + edge + fit - length_cost;
                if v > best[i * width + k] {
                    best[i * width + k] = v;
                    from[i * width + k] = j;
                }
            }
        }
    }
    // 最後の音は区間の終わり（e）で終える
    let mut bounds = vec![width - 1];
    let mut k = width - 1;
    for i in (1..=n).rev() {
        k = from[i * width + k];
        bounds.push(k);
    }
    bounds.reverse();
    (0..n)
        .map(|i| Mora {
            start: to_sec(s + bounds[i]),
            end: to_sec(s + bounds[i + 1]),
            // 境目の点が低いものは確かでない
            sure: i == 0 || score[s + bounds[i]] >= 0.25,
            vowel_ok: {
                let v = codes[i] & VOWEL_MASK;
                let len = (bounds[i + 1] - bounds[i]) as f32;
                // ー は前の音を伸ばすので長くてよい
                (v == LONG || len <= avg * TOO_LONG_RATIO) && !wrong_vowel(&sums, s + bounds[i], s + bounds[i + 1], if v == LONG { prev_vowel[i] } else { v })
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 16000.0;

    /// 母音らしい音（声帯のパルスを、2 つのフォルマントの共振に通す）
    fn vowel(sec: f32, f0: f32, f1: f32, f2: f32) -> Vec<f32> {
        let n = (sec * SR) as usize;
        let period = (SR / f0) as usize;
        let mut src: Vec<f32> = (0..n).map(|i| if i % period == 0 { 1.0 } else { 0.0 }).collect();
        for (fc, bw) in [(f1, 80.0), (f2, 120.0)] {
            let r = (-std::f32::consts::PI * bw / SR).exp();
            let c = 2.0 * r * (2.0 * std::f32::consts::PI * fc / SR).cos();
            let (mut y1, mut y2) = (0.0f32, 0.0f32);
            for v in src.iter_mut() {
                let y = *v + c * y1 - r * r * y2;
                y2 = y1;
                y1 = y;
                *v = y;
            }
        }
        let peak = src.iter().fold(0.0f32, |m, v| m.max(v.abs())).max(1e-9);
        src.iter().map(|v| v / peak * 0.5).collect()
    }

    /// 擬似乱数の雑音（摩擦音の代わり）
    fn noise(sec: f32, amp: f32) -> Vec<f32> {
        let mut s = 12345u32;
        (0..(sec * SR) as usize)
            .map(|_| {
                s = s.wrapping_mul(1103515245).wrapping_add(12345);
                ((s >> 16) as f32 / 32768.0 - 1.0) * amp
            })
            .collect()
    }

    fn code(vowel: u8, consonant: u8) -> u8 {
        vowel | consonant << CONSONANT_SHIFT
    }

    /// 「あ」「い」「う」を短い無音を挟んでつなぐと、境目は無音のあたりに来る
    #[test]
    fn splits_vowels_at_gaps() {
        let mut x = Vec::new();
        x.extend(vowel(0.3, 200.0, 800.0, 1250.0));
        x.extend(vec![0.0; (0.05 * SR) as usize]);
        x.extend(vowel(0.3, 200.0, 320.0, 2300.0));
        x.extend(vec![0.0; (0.05 * SR) as usize]);
        x.extend(vowel(0.3, 200.0, 360.0, 1350.0));
        let m = segment(&x, SR, &[0, 1, 2]);
        assert_eq!(m.len(), 3);
        // 2 つ目と 3 つ目の始まりは、それぞれの無音の終わり（0.35 秒、0.70 秒）の近く
        assert!((m[1].start - 0.35).abs() < 0.06, "{:?}", m);
        assert!((m[2].start - 0.70).abs() < 0.06, "{:?}", m);
    }

    /// 無音を挟まなくても、母音が変わる所で分ける
    #[test]
    fn splits_at_vowel_change() {
        let mut x = vowel(0.35, 180.0, 800.0, 1250.0);
        x.extend(vowel(0.35, 180.0, 320.0, 2300.0));
        let m = segment(&x, SR, &[0, 1]);
        assert!((m[1].start - 0.35).abs() < 0.07, "{:?}", m);
    }

    /// 雑音（子音）の始まりを、次の音の始まりにする
    #[test]
    fn consonant_starts_mora() {
        let mut x = vowel(0.3, 200.0, 800.0, 1250.0);
        x.extend(noise(0.08, 0.2));
        x.extend(vowel(0.3, 200.0, 800.0, 1250.0));
        let m = segment(&x, SR, &[0, code(0, C_FRICATIVE)]);
        assert!((m[1].start - 0.30).abs() < 0.05, "{:?}", m);
    }

    /// 読みは「い」でも「え」の音なら、母音が合わない印を付ける
    #[test]
    fn marks_wrong_vowel() {
        let mut x = vowel(0.3, 200.0, 800.0, 1250.0);
        x.extend(vec![0.0; (0.05 * SR) as usize]);
        x.extend(vowel(0.3, 200.0, 500.0, 1900.0));
        let m = segment(&x, SR, &[0, 1]);
        assert!(m[0].vowel_ok, "{:?}", m);
        assert!(!m[1].vowel_ok, "{:?}", m);
    }

    /// え の所に え、い と続く音が入ったら、母音が合わない印を付ける
    #[test]
    fn marks_mixed_vowels() {
        let mut x = vowel(0.3, 200.0, 800.0, 1250.0);
        x.extend(vec![0.0; (0.05 * SR) as usize]);
        x.extend(vowel(0.2, 200.0, 500.0, 1900.0));
        x.extend(vowel(0.2, 200.0, 320.0, 2300.0));
        let m = segment(&x, SR, &[0, 3]);
        assert!(!m[1].vowel_ok, "{:?}", m);
    }

    /// ね、え のように同じ母音が続くと音の境目がないので、伸ばした母音を分け合い、ね が一瞬にならない
    #[test]
    fn same_vowel_shares_length() {
        // ね の子音（鼻音: 弱く、F1 が低い）から え を伸ばす
        let mut x: Vec<f32> = vowel(0.06, 200.0, 250.0, 1200.0).iter().map(|v| v * 0.3).collect();
        x.extend(vowel(0.9, 200.0, 500.0, 1900.0));
        x.extend(vec![0.0; (0.05 * SR) as usize]);
        x.extend(vowel(0.3, 200.0, 320.0, 2300.0));
        let m = segment(&x, SR, &[code(3, C_NASAL), 3, 1]);
        assert!(m[0].end - m[0].start > 0.25, "{:?}", m);
        assert!(m[1].end - m[1].start > 0.25, "{:?}", m);
    }

    /// 長い区間（20 秒、80 音）でもすぐ終わり、すべての音が区間の中に並ぶ
    #[test]
    fn long_segment_is_fast() {
        let mut x = Vec::new();
        for i in 0..80 {
            let (f1, f2) = VOWEL_FORMANTS[i % 5];
            x.extend(vowel(0.22, 200.0, f1, f2));
            x.extend(vec![0.0; (0.03 * SR) as usize]);
        }
        let codes: Vec<u8> = (0..80).map(|i| (i % 5) as u8).collect();
        let t = std::time::Instant::now();
        let m = segment(&x, SR, &codes);
        assert_eq!(m.len(), 80);
        assert!(m.windows(2).all(|w| w[0].end <= w[1].start + 1e-4), "{:?}", m);
        assert!(t.elapsed().as_secs_f32() < 5.0, "{:?}", t.elapsed());
    }

    /// 音が足りないときは均等に分け、確かでない印を付ける
    #[test]
    fn too_many_morae_split_evenly() {
        let x = vowel(0.1, 200.0, 800.0, 1250.0);
        let m = segment(&x, SR, &[0, 0, 0, 0, 0]);
        assert!(m.iter().all(|m| m.vowel_ok));
        assert_eq!(m.len(), 5);
        assert!(m.iter().all(|m| !m.sure));
    }
}
