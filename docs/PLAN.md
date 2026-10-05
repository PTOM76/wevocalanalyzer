# 進め方

WeVocalAnalyzer を、波形を表示する土台から声の解析のツールにしていく手順。(2026-10-05)

## 1. 方針
- Extractor と同じく、UI なしのライブラリ（`src/`、`exports: ./src/index.ts`）と画面（`app/`）に分ける
- 画面は WeVocalSynth と同じ部品で組む（PevenMUI の配置、ステータスバー、下のバー。wevocal-lib の波形、ミニマップ、表示範囲のフック）。再生のボタンは Synth のものを写す
- WeVocalSynth からは追加機能として使う。今のところスペクトログラムだけ。F0、F1 などの API もライブラリからは使えるようにしておく。歌詞の文字化は Analyzer の画面だけ
- 音声は外部に送らない

## 2. 手順
1. （済み）スペクトログラム: Synth の `dsp/src/spec.rs` と `src/components/waveform/spectrogramImage.ts`、`draw.ts` のスペクトログラムの描画を移す。計算は Rust（wasm）で、STFT は wevocal-lib のものを使う。重いので Worker で行う
2. （済み）ライブラリの API: `analyzeSpectrogram(clip, { onProgress, signal })`、`renderSpectrogram`
3. WeVocalSynth に submodule として足し、追加機能（`analyzer`）として登録する。Synth のスペクトログラムは、追加機能に切り替えてから消す
4. F0、フォルマント（F1〜F3）の帯。F0 は wevocal-lib の `f0`（YIN）を使う
5. 周波数の解析（選択範囲の平均のスペクトル）、カーソル位置の数値、CSV の書き出し
6. 歌詞の文字化（Whisper などの ONNX。モデルの取得と保存は Extractor の仕組みを共通にしてから）

## 3. あとで足すもの
- 設定のダイアログ（言語、テーマ、画面の大きさ）。Synth と Extractor の設定画面を参考にする
- 選択範囲、トラック、ショートカット（PevenMUI の keymap）
- アイコン（今は Synth のものを仮に使っている）
