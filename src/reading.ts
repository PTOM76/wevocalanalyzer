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

// 一音の印（dsp の mora.rs と一致させる）: 下位 3 ビットが母音（0〜4 があいうえお、5 が ん、6 が っ、7 が ー）、その上が子音の種類
const VOWELS = ['あかさたなはまやらわがざだばぱぁゃゎ', 'いきしちにひみりぎじぢびぴぃ', 'うくすつぬふむゆるぐずづぶぷゔぅゅ', 'えけせてねへめれげぜでべぺぇ', 'おこそとのほもよろをごぞどぼぽぉょ']
const CONSONANTS: [number, string][] = [
  [1, 'かきくけこがぎぐげごたちつてとだぢづでどぱぴぷぺぽばびぶべぼ'], // 破裂
  [2, 'さしすせそざじずぜぞはひふへほ'], // 摩擦
  [3, 'なにぬねのまみむめも'], // 鼻音
]

/** 一音（ひらがな。きゃ のような 2 文字も）の印。分からないものは「あ」として扱う */
export function moraCode(mora: string): number {
  const m = toHiragana(mora)
  if (m === 'ん') return 5
  if (m === 'っ') return 6
  if (m === 'ー') return 7
  // 母音は最後の字（きゃ なら ゃ）、子音は最初の字で決める
  const vowel = Math.max(0, VOWELS.findIndex((v) => v.includes(m[m.length - 1])))
  const consonant = CONSONANTS.find(([, s]) => s.includes(m[0]))?.[0] ?? 0
  return vowel | (consonant << 3)
}
