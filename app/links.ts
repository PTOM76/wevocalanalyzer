// 外部へのリンク。移転したらここだけを変える（WeVocalSynth の src/links.ts と同じ形）

export const REPOSITORY_URL = 'https://github.com/PTOM76/wevocalanalyzer'

/** ユーザーガイド（ヘルプ → ユーザーガイド） */
export const USER_GUIDE_URL = 'https://github.com/PTOM76/wevocalanalyzer#readme'

/** リンクをブラウザの新しいタブで開く（アプリの画面はそのまま残す） */
export const openExternal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')
