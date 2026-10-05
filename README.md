# WeVocalAnalyzer
WeVocalAnalyzerは、Webブラウザ上で音声を解析するためのツールである。

音声ファイルはサーバーへ送らず、処理はすべてブラウザ内で行う。<br />
画面を持たないライブラリとしても使え、[WeVocalSynth](https://github.com/PTOM76/wevocalsynth) から追加機能として使う予定（今のところスペクトログラム）。

## 今の状態
WeVocalSynth と同じ部品（[PevenMUI](https://github.com/PTOM76/pevenmui) の画面の配置、[wevocal-lib](https://github.com/PTOM76/wevocal-lib) の波形とミニマップ）で組んだ土台。

| できること | 内容 |
| --- | --- |
| 開く | 音声ファイルを開く（ドロップも） |
| 表示 | 波形、スペクトログラム（フォルマント F1〜F3 を重ねる）、ピッチ（F0）、時間の目盛り、ミニマップ。ホイールでズームとスクロール |
| 値 | カーソルの位置（なければ再生位置）の F0、音名、F1〜F3 |
| 再生 | 再生、一時停止、停止。波形を押すとその位置へ |

歌詞の文字化などはこれから。要件は [docs/REQUIREMENT.md](docs/REQUIREMENT.md)。

## 構成
| 場所 | 中身 |
| --- | --- |
| `src/` | ライブラリ（UI なし、React に依存しない）。WeVocalSynth の追加機能からも使う。`analyzeSpectrogram`、`analyzePitch`、`analyzeFormants`（Worker で計算）、`renderSpectrogram`（画像にする） |
| `dsp/` | 解析の計算（Rust → wasm、`npm run build:wasm` で `src/dsp.wasm` を作る。FFT は wevocal-lib） |
| `app/` | 単体のサイトの画面 |
| `pevenmui/`、`wevocal-lib/` | submodule。WeVocalSynth の submodule として隣にあればそちらを使う（`vite.config.ts`） |

## 開発
```sh
git submodule update --init
npm install
npm run dev
```

## ライセンス
MIT（[LICENSE](LICENSE)）
