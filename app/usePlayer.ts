import { useCallback, useEffect, useRef, useState } from 'react'
import { startContext, suspendContext, type Clip } from 'wevocal-lib'

/** 1つの音声の再生と停止。再生位置は `livePosition()` で毎フレーム読む（React の状態は止めたときだけ更新する） */
export function usePlayer(clip: Clip | null) {
  const ctxRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
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
    bufferRef.current = null
    setPlaying(false)
    setPosition(0)
  }, [clip, halt])

  const play = async (from = position) => {
    if (!clip) return
    const c = ctx()
    await startContext(c, 'analyzer')
    if (!bufferRef.current) {
      const b = c.createBuffer(clip.channels.length, clip.channels[0].length, clip.sampleRate)
      clip.channels.forEach((ch, i) => b.copyToChannel(ch as Float32Array<ArrayBuffer>, i))
      bufferRef.current = b
    }
    halt()
    const s = c.createBufferSource()
    s.buffer = bufferRef.current
    s.connect(c.destination)
    const start = from >= duration ? 0 : from
    s.onended = () => {
      sourceRef.current = null
      setPlaying(false)
      setPosition(duration)
    }
    s.start(0, start)
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

  return { playing, position, duration, livePosition, toggle: () => (playing ? pause() : void play()), stop, seek }
}
