// アプリの定義。vite.config.ts からも読み込むので、ほかのファイルを import しない（使い方は appConfig.ts の app。WeVocalSynth と同じ形）
export const APP_INFO = {
  id: 'wevocalanalyzer',
  name: 'WeVocalAnalyzer',
  description: '声を解析する Web ツール',
  author: 'PitaQ',
  repository: 'https://github.com/PTOM76/wevocalanalyzer',
  // ユーザーガイド（ヘルプ → ユーザーガイド）。移転したらここだけを変える
  guide: 'https://github.com/PTOM76/wevocalanalyzer#readme',
  lang: 'ja_jp',
}
