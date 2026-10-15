// 一音ずつ切り出したものの出し方（五十音順に並べる、UTAU の音源）。WeVocalSynth と WeVocal Studio で共通
import { createZip } from 'pevenmui/web'
import { encodeWav, type Clip } from 'wevocal-lib'
import { type MoraMark, sliceMora, usableMorae } from './kanaCut'

/** 五十音の行（段の順はあいうえお）。ローマ字は UTAU の音源でよく使う形 */
const ROWS: [string, string[]][] = [
  ['あいうえお', ['a', 'i', 'u', 'e', 'o']],
  ['かきくけこ', ['ka', 'ki', 'ku', 'ke', 'ko']],
  ['さしすせそ', ['sa', 'shi', 'su', 'se', 'so']],
  ['たちつてと', ['ta', 'chi', 'tsu', 'te', 'to']],
  ['なにぬねの', ['na', 'ni', 'nu', 'ne', 'no']],
  ['はひふへほ', ['ha', 'hi', 'fu', 'he', 'ho']],
  ['まみむめも', ['ma', 'mi', 'mu', 'me', 'mo']],
  ['やゆよ', ['ya', 'yu', 'yo']],
  ['らりるれろ', ['ra', 'ri', 'ru', 're', 'ro']],
  ['わをん', ['wa', 'wo', 'n']],
  ['がぎぐげご', ['ga', 'gi', 'gu', 'ge', 'go']],
  ['ざじずぜぞ', ['za', 'ji', 'zu', 'ze', 'zo']],
  ['だぢづでど', ['da', 'di', 'du', 'de', 'do']],
  ['ばびぶべぼ', ['ba', 'bi', 'bu', 'be', 'bo']],
  ['ぱぴぷぺぽ', ['pa', 'pi', 'pu', 'pe', 'po']],
]
/** 拗音（きゃ など）を作る行の頭と、そのローマ字の子音 */
const YOON: [string, string][] = [
  ['き', 'ky'], ['し', 'sh'], ['ち', 'ch'], ['に', 'ny'], ['ひ', 'hy'], ['み', 'my'], ['り', 'ry'],
  ['ぎ', 'gy'], ['じ', 'j'], ['び', 'by'], ['ぴ', 'py'],
]

/** 五十音順の並びと、それぞれのローマ字 */
const ORDER: [string, string][] = [
  ...ROWS.flatMap(([kana, romaji]) => [...kana].map((k, i): [string, string] => [k, romaji[i]])),
  ...YOON.flatMap(([head, c]) => (['ゃ', 'ゅ', 'ょ'] as const).map((s, i): [string, string] => [head + s, c + ['a', 'u', 'o'][i]])),
  ['っ', 'cl'],
  ['ー', 'long'],
]
const INDEX = new Map(ORDER.map(([k], i) => [k, i]))
const ROMAJI = new Map(ORDER)

/** ファイル名に使うローマ字（表にないものは、かなの文字コード） */
const romajiOf = (mora: string) => ROMAJI.get(mora) ?? [...mora].map((c) => c.codePointAt(0)!.toString(16)).join('_')

/** 音ごとに 1 つ（確かなものを優先し、なければ最初のもの）を、五十音順に並べる */
export function pickPerMora(morae: MoraMark[]): MoraMark[] {
  const best = new Map<string, MoraMark>()
  for (const m of morae) {
    const cur = best.get(m.mora)
    if (!cur || (!cur.sure && m.sure)) best.set(m.mora, m)
  }
  return [...best.values()].sort((a, b) => (INDEX.get(a.mora) ?? 1e9) - (INDEX.get(b.mora) ?? 1e9) || a.mora.localeCompare(b.mora))
}

/** 音と音の間の無音（秒） */
const GAP_SEC = 0.2

/** 音ごとに 1 つ（無音のものは除く）を五十音順に、無音を挟んで 1 本の音声にする。返す範囲は新しい音声の中の位置 */
export function lineUp(clip: Clip, morae: MoraMark[], keepAll = false): { clip: Clip; morae: MoraMark[] } {
  const parts = pickPerMora(usableMorae(clip, morae, keepAll)).map((m) => ({ m, c: sliceMora(clip, m) }))
  const gap = Math.round(GAP_SEC * clip.sampleRate)
  const len = parts.reduce((s, p) => s + p.c.channels[0].length + gap, gap)
  const channels = clip.channels.map(() => new Float32Array(len))
  const out: MoraMark[] = []
  let at = gap
  for (const { m, c } of parts) {
    channels.forEach((ch, i) => ch.set(c.channels[i], at))
    const n = c.channels[0].length
    out.push({ start: at / clip.sampleRate, end: (at + n) / clip.sampleRate, mora: m.mora, sure: m.sure })
    at += n + gap
  }
  return { clip: { sampleRate: clip.sampleRate, channels }, morae: out }
}

/** Shift_JIS にする（本家の UTAU の oto.ini のため）。使うのは ASCII、ひらがな、ー だけなので小さな変換で足りる */
function toShiftJis(text: string): Uint8Array {
  const out: number[] = []
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) out.push(c)
    // ひらがな ぁ〜ん は Shift_JIS の 0x829F〜0x82F1 に同じ順で並ぶ
    else if (c >= 0x3041 && c <= 0x3093) out.push(0x82, 0x9f + (c - 0x3041))
    else if (c === 0x30fc) out.push(0x81, 0x5b)
    else out.push(0x3f)
  }
  return new Uint8Array(out)
}

/**
 * UTAU の音源（ZIP）。音ごとに 1 つ（無音のものは除く）を ローマ字.wav にし、oto.ini の別名でかなを付ける。
 * 各ファイルは切り出した一音だけなので、左ブランクは 0、先行発声と固定範囲は前の余白の長さから決める
 */
export async function exportUtau(clip: Clip, morae: MoraMark[], name: string, keepAll = false): Promise<Blob> {
  const picked = pickPerMora(usableMorae(clip, morae, keepAll))
  const files = picked.map((m) => ({ name: `${romajiOf(m.mora)}.wav`, data: encodeWav(sliceMora(clip, m)) }))
  // 左ブランク, 固定範囲, 右ブランク（0 は最後まで）, 先行発声, オーバーラップ（ms）
  const oto = picked.map((m) => `${romajiOf(m.mora)}.wav=${m.mora},0,60,0,20,10`).join('\r\n')
  return createZip([...files, { name: 'oto.ini', data: toShiftJis(oto + '\r\n') }, { name: 'character.txt', data: toShiftJis(`name=${name}\r\n`) }])
}
