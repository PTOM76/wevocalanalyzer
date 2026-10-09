// ラベル（注釈）と、その書き出しの形式（Praat の TextGrid、タブ区切りのテキスト）
export interface Label {
  /** 範囲（秒）。start と end が同じなら時刻の点 */
  start: number
  end: number
  text: string
}

/** 時刻の点か */
export const isPoint = (l: Label) => l.end - l.start < 1e-6

/** 時刻の順に並べる */
export const sortLabels = (labels: Label[]) => [...labels].sort((a, b) => a.start - b.start || a.end - b.end)

const q = (s: string) => `"${s.replace(/"/g, '""')}"`
const num = (x: number) => String(Math.round(x * 1e6) / 1e6)

/**
 * Praat の TextGrid（長い形式）。範囲は IntervalTier「labels」に、点は TextTier「points」に入れる。
 * IntervalTier は隙間を空の区間で埋める（重なる範囲は、前の範囲の終わりから始める）
 */
export function toTextGrid(labels: Label[], duration: number): string {
  const sorted = sortLabels(labels)
  const ranges = sorted.filter((l) => !isPoint(l))
  const points = sorted.filter(isPoint)
  const intervals: Label[] = []
  let t = 0
  for (const r of ranges) {
    const start = Math.max(t, r.start)
    const end = Math.min(duration, r.end)
    if (end <= start) continue
    if (start > t) intervals.push({ start: t, end: start, text: '' })
    intervals.push({ start, end, text: r.text })
    t = end
  }
  if (t < duration) intervals.push({ start: t, end: duration, text: '' })
  const out = ['File type = "ooTextFile"', 'Object class = "TextGrid"', '', 'xmin = 0', `xmax = ${num(duration)}`, 'tiers? <exists>', `size = ${points.length ? 2 : 1}`, 'item []:']
  out.push('    item [1]:', '        class = "IntervalTier"', '        name = "labels"', '        xmin = 0', `        xmax = ${num(duration)}`, `        intervals: size = ${intervals.length}`)
  intervals.forEach((l, i) => out.push(`        intervals [${i + 1}]:`, `            xmin = ${num(l.start)}`, `            xmax = ${num(l.end)}`, `            text = ${q(l.text)}`))
  if (points.length) {
    out.push('    item [2]:', '        class = "TextTier"', '        name = "points"', '        xmin = 0', `        xmax = ${num(duration)}`, `        points: size = ${points.length}`)
    points.forEach((l, i) => out.push(`        points [${i + 1}]:`, `            number = ${num(l.start)}`, `            mark = ${q(l.text)}`))
  }
  return out.join('\n') + '\n'
}

/** タブ区切りのテキスト（1 行に 開始、終わり、文字。秒）。多くの音声編集ソフトのラベルと同じ形 */
export function toLabelText(labels: Label[]): string {
  return sortLabels(labels).map((l) => `${num(l.start)}\t${num(l.end)}\t${l.text.replace(/[\t\n]/g, ' ')}`).join('\n') + '\n'
}
