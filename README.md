# WeVocalAnalyzer
WeVocalAnalyzerは、Webブラウザ上で音声を解析するためのツールである。

音声ファイルはサーバーへ送らず、処理はすべてブラウザ内で行う。<br />
画面を持たないライブラリとしても使え、[WeVocalSynth](https://github.com/PTOM76/wevocalsynth) から追加機能として使う予定（今のところスペクトログラム）。

## 今の状態
WeVocalSynth と同じ部品（[PevenMUI](https://github.com/PTOM76/pevenmui) の画面の配置、[wevocal-lib](https://github.com/PTOM76/wevocal-lib) の波形とミニマップ）で組んだ土台。

| できること | 内容 |
| --- | --- |
| 開く | 音声ファイルを開く（ドロップも） |
| 表示 | 波形、スペクトログラム（フォルマント F1〜F3 を重ねる、縦の拡大）、F0、強さの帯（出すものを選ぶ、境目で高さを変える）、時間の目盛り、ミニマップ。ホイールでズームとスクロール |
| 値 | カーソルの位置（なければ再生位置）の F0、音名、F1〜F3、強さ、カーソルの高さの周波数。スペクトル（選択範囲の平均かその時点） |
| 歌詞 | Whisper で歌詞を文字にし、帯に並べる（WebGPU が必要。モデルは初めて使うときにダウンロード） |
| 書き出し | F0、F1〜F3、強さを CSV で（全体か選択範囲）、歌詞を SRT で |
| 再生 | 再生、一時停止、停止、時間の入力。押すと再生位置へ、目盛りのドラッグで再生位置を動かす |
| 選択範囲 | ドラッグで選択、端で調整、範囲を試聴。範囲の F0 とフォルマントの平均 |
| 操作 | 拡大、縮小、全体表示、追従。キーの割り当て、PC/スマホ（2 本指の拡大縮小）、ライト/ダーク、日本語/英語/韓国語/中国語、オフライン（PWA） |

要件は [docs/REQUIREMENT.md](docs/REQUIREMENT.md)。

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
