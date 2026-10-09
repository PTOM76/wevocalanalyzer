// 範囲のラウドネスとトゥルーピーク（範囲が決まってから少し待って Worker で計算する）
import { useEffect, useState } from 'react'
import type { Clip } from 'wevocal-lib'
import { measureLoudness, type Loudness } from '../src/index'

/** 範囲を動かしている間は計算しない（ms） */
const WAIT_MS = 300

/** clip の start〜end のラウドネス。計算中と範囲がないときは null */
export function useLoudness(clip: Clip | null, start: number | null, end: number | null): Loudness | null {
  const [result, setResult] = useState<{ key: string; value: Loudness } | null>(null)
  const key = clip && start !== null && end !== null && end > start ? `${start}:${end}` : null
  useEffect(() => {
    if (!clip || !key || start === null || end === null) return
    const ac = new AbortController()
    const timer = setTimeout(() => {
      measureLoudness(clip, start, end, ac.signal).then(
        (value) => setResult({ key, value }),
        () => {},
      )
    }, WAIT_MS)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [clip, key, start, end])
  // 前の音声の結果を出さないよう、音声が変わったら捨てる
  const [prevClip, setPrevClip] = useState(clip)
  if (prevClip !== clip) {
    setPrevClip(clip)
    setResult(null)
  }
  return result && result.key === key ? result.value : null
}
