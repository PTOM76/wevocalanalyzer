import { RULER_HEIGHT } from 'wevocal-lib'

/** 帯の種類。上からこの順に並べる（波形は wevocal-lib の描画が目盛りのすぐ下を前提にしているので、いつも一番上） */
export type Lane = 'wave' | 'spec' | 'f0' | 'level' | 'lyrics'
export const LANES: Lane[] = ['wave', 'spec', 'f0', 'level', 'lyrics']

/** 帯ごとの表示と、高さの比 */
export type LaneFlags = Record<Lane, boolean>
export type LaneWeights = Record<Lane, number>

/** 帯の場所（Canvas の中の上端と高さ） */
export interface LaneRect {
  lane: Lane
  top: number
  h: number
}

/** 帯の最低の高さ（px）。境目のドラッグでもこれより小さくしない */
export const MIN_LANE_PX = 40
/** 境目をつかめる距離（px） */
const DIVIDER_GRAB_PX = 4

/** 出す帯を、目盛りの下の高さ `total` に比で割り振る */
export function layoutLanes(show: LaneFlags, weights: LaneWeights, height: number): LaneRect[] {
  const shown = LANES.filter((l) => show[l])
  const body = Math.max(0, height - RULER_HEIGHT)
  const sum = shown.reduce((s, l) => s + weights[l], 0) || 1
  let top = RULER_HEIGHT
  return shown.map((lane, i) => {
    // 最後の帯で端数を吸収する
    const h = i === shown.length - 1 ? RULER_HEIGHT + body - top : Math.round((body * weights[lane]) / sum)
    const r = { lane, top, h }
    top += h
    return r
  })
}

/** y（Canvas の中）にある帯 */
export const laneAt = (rects: LaneRect[], y: number) => rects.find((r) => y >= r.top && y < r.top + r.h) ?? null

/** y の近くにある境目（上の帯の番号）。なければ -1 */
export function dividerAt(rects: LaneRect[], y: number) {
  for (let i = 0; i < rects.length - 1; i++) if (Math.abs(rects[i].top + rects[i].h - y) <= DIVIDER_GRAB_PX) return i
  return -1
}

/**
 * 境目 `i`（帯 i と i+1 の間）を `dy` だけ動かしたときの比。2 つの帯の比の合計は変えず、どちらも MIN_LANE_PX より小さくしない
 */
export function dragDivider(rects: LaneRect[], weights: LaneWeights, i: number, dy: number): LaneWeights {
  const a = rects[i]
  const b = rects[i + 1]
  const total = a.h + b.h
  const ha = Math.max(MIN_LANE_PX, Math.min(total - MIN_LANE_PX, a.h + dy))
  const w = weights[a.lane] + weights[b.lane]
  return { ...weights, [a.lane]: (w * ha) / total, [b.lane]: (w * (total - ha)) / total }
}
