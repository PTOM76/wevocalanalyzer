# WeVocalAnalyzer ドキュメント

## 使う人向け
- [使い方](MANUAL.md)（利用者向けの操作説明）

## 設計
- [要件定義](REQUIREMENT.md)（何を目指し、どこまでできているか）

## 開発者向け
セットアップと使用できるコマンドは [README](../README.md#開発) と [todofile.json5](../todofile.json5)。

## wiki
`docs/wiki/` のページ（`start.md` 以外）は `npm run docs:wiki` が [MANUAL.md](MANUAL.md) から作る。手で書き換えない。MANUAL.md に `##` の見出しを足したら、`scripts/docs-to-dokuwiki.mjs` の `PAGES` にどのページへ入れるかを足す（足さないとスクリプトが止まる）。
