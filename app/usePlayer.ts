import { useCallback, useEffect, useRef, useState } from 'react'
import { startContext, suspendContext, type Clip } from 'wevocal-lib'

/** 比較の音声（B）。`offset` は B を A に対して遅らせる量（秒） */
export interface AltSource {
  clip: Clip
  offset: number
}

/**
 * 1つの音声の再生と停止。再生位置は `livePosition()` で毎フレーム読む（React の状態は止めたときだけ更新する）。
 * `alt` があれば、鳴らす音を B に切り替えられる（再生位置は A の時刻のまま）
 */
export function usePlayer(clip: Clip | null, alt: AltSource | null = null) {
  const ctxRef = useRef<AudioContext | null>(null)
  // 音声ごとの AudioBuffer（A と B を切り替えても作り直さない）
  const buffers = useRef(new WeakMap<Clip, AudioBuffer>())
  // 今の再生の終わり（A の時刻。範囲の再生のとき）
  const toRef = useRef<number | undefined>(undefined)
  const [listenAlt, setListenAlt] = useState(false)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  // 再生を始めた AudioContext の時刻と、そのときの再生位置
  const startRef = useRef({ at: 0, from: 0 })
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  const ctx = () => (ctxRef.current ??= new AudioContext())
  const duration = clip ? clip.channels[0].length / clip.sampleRate : 0

  const livePosition = useCallback(() => {
    const c = ctxRef.current
    if (!sourceRef.current || !c) return position
    return Math.min(duration, startRef.current.from + c.currentTime - startRef.current.at)
  }, [position, duration])

  const halt = useCallback(() => {
    const s = sourceRef.current
    if (!s) return
    sourceRef.current = null
    s.onended = null
    s.stop()
    s.disconnect()
  }, [])

  // 音声が変わったら止めて、先頭に戻す
  useEffect(() => {
    halt()
    setPlaying(false)
    setPosition(0)
  }, [clip, halt])
  // B を閉じたら A に戻す
  const altClip = alt?.clip ?? null
  if (!altClip && listenAlt) setListenAlt(false)

  const bufferOf = (c: AudioContext, src: Clip) => {
    let b = buffers.current.get(src)
    if (!b) {
      b = c.createBuffer(src.channels.length, src.channels[0].length, src.sampleRate)
      for (const [i, ch] of src.channels.entries()) b.copyToChannel(ch as Float32Array<ArrayBuffer>, i)
      buffers.current.set(src, b)
    }
    return b
  }
  // B の AudioBuffer は開いたときに作っておく（切り替えたときの途切れを短くするため）
  useEffect(() => {
    if (altClip) bufferOf(ctx(), altClip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altClip])

  /** `from` から再生する。`to` を渡すとそこで止まる（選択範囲の再生）。`useAlt` なら B を鳴らす（時刻は A のまま） */
  const play = async (from = position, to?: number, useAlt = listenAlt) => {
    if (!clip) return
    const c = ctx()
    await startContext(c, 'analyzer')
    halt()
    const b = useAlt && alt ? alt : null
    const s = c.createBufferSource()
    s.buffer = bufferOf(c, b ? b.clip : clip)
    s.connect(c.destination)
    const start = from >= duration ? 0 : from
    const end = to === undefined ? duration : Math.min(duration, to)
    toRef.current = to
    s.onended = () => {
      // B が A より短いと、範囲の終わりより前に終わる
      setPosition(Math.min(end, startRef.current.from + c.currentTime - startRef.current.at))
      sourceRef.current = null
      setPlaying(false)
    }
    // B は A の時刻から offset を引いた位置を鳴らす。B の頭より前なら、その分遅らせて始める
    const shift = b ? b.offset : 0
    const inSrc = start - shift
    const wait = Math.max(0, -inSrc)
    s.start(c.currentTime + wait, Math.max(0, inSrc), Math.max(0, end - start - wait))
    sourceRef.current = s
    startRef.current = { at: c.currentTime, from: start }
    setPlaying(true)
  }

  const pause = () => {
    const t = livePosition()
    halt()
    setPlaying(false)
    setPosition(t)
    if (ctxRef.current) suspendContext(ctxRef.current, 'analyzer')
  }

  const stop = () => {
    halt()
    setPlaying(false)
    setPosition(0)
  }

  const seek = (t: number) => {
    const to = Math.max(0, Math.min(duration, t))
    if (sourceRef.current) void play(to)
    else setPosition(to)
  }

  /** 鳴らす音を A と B で切り替える。再生中なら同じ位置から鳴らし直す */
  const switchSource = () => {
    if (!alt) return
    const next = !listenAlt
    setListenAlt(next)
    if (sourceRef.current) void play(livePosition(), toRef.current, next)
  }

  return {
    playing, position, duration, livePosition, toggle: () => (playing ? pause() : void play()), stop, seek, playRange: (from: number, to: number) => void play(from, to),
    listenAlt, switchSource,
  }
}
