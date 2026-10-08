/**
 * 歌詞の読み（かな）と、一音（モーラ）ずつの分け方。形態素解析（kuromoji）の結果を受け取るだけで、辞書は読まない
 * （辞書は文字化の Worker で読む。lyricsWorker.ts）
 */

/** 形態素解析の 1 語（kuromoji の IpadicFeatures の一部） */
export interface ReadingToken {
  surface_form: string
  pos: string
  reading?: string
}

const KANA_OFFSET = 0x60

/** カタカナをひらがなにする（ー などはそのまま） */
export const toHiragana = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - KANA_OFFSET))

const isKana = (c: string) => /[ぁ-ゖァ-ヺー]/.test(c)

/**
 * 語の並びから読み（ひらがな）を作る。助詞の「は」「へ」は発音どおり「わ」「え」にする。
 * 辞書にない語は、かなならそのまま、それ以外（英字、記号）は読みに入れない
 */
export function readingOf(tokens: ReadingToken[]): string {
  let out = ''
  for (const t of tokens) {
    if (t.pos === '助詞' && t.surface_form === 'は') out += 'わ'
    else if (t.pos === '助詞' && t.surface_form === 'へ') out += 'え'
    else if (t.reading && t.reading !== '*') out += t.reading
    else out += [...t.surface_form].filter(isKana).join('')
  }
  return toHiragana(out)
}

/** 前の音にくっつく小さい字（きゃ、ふぁ など） */
const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ'])

/** 読みを一音（モーラ）ずつに分ける。拗音（きゃ）は 1 つ、っ・ん・ー もそれぞれ 1 つ。かな以外は捨てる */
export function splitMora(reading: string): string[] {
  const morae: string[] = []
  for (const c of reading) {
    if (!isKana(c)) continue
    if (SMALL.has(c) && morae.length) morae[morae.length - 1] += c
    else morae.push(c)
  }
  return morae
}
