// 1 つの音声の解析（強さ、スペクトログラム、F0、フォルマント）。比較の音声でも同じものを使う（memo/analyzer-compare.md）
import { useEffect, useState } from 'react'
import { startJob } from 'pevenmui'
import type { Clip } from 'wevocal-lib'
import { analyzeFormants, analyzeLevel, analyzePitch, analyzeSpectrogram, type Formants, type Level, type Pitch, type Spectrogram } from '../src/index'
import { t } from './i18n'

/** 解析の設定（設定画面の「解析」） */
export interface AnalysisOptions {
  specWindow: number
  f0Min: number
  f0Max: number
  formantCeiling: number
}

export interface Analysis {
  spec: Spectrogram | null
  pitch: Pitch | null
  formants: Formants | null
  level: Level | null
}

/**
 * 強さはその場で（軽いので）、スペクトログラム、F0、フォルマントは順に Worker で計算する。
 * 別の音声か解析の設定に変わったら中止して計算し直す。進み具合は 1 本のゲージにまとめる（重さの目安で 4 : 3 : 3 に割る）
 */
export function useAnalysis(clip: Clip | null, o: AnalysisOptions, onError: (message: string) => void): Analysis {
  const [spec, setSpec] = useState<Spectrogram | null>(null)
  const [pitch, setPitch] = useState<Pitch | null>(null)
  const [formants, setFormants] = useState<Formants | null>(null)
  const [level, setLevel] = useState<Level | null>(null)
  useEffect(() => setLevel(clip ? analyzeLevel(clip) : null), [clip])
  useEffect(() => {
    setSpec(null)
    setPitch(null)
    setFormants(null)
    if (!clip) return
    const ac = new AbortController()
    const job = startJob('analyze', t('job.kind.analyze'), () => ac.abort())
    const part = (from: number, span: number) => ({ signal: ac.signal, onProgress: (p: number) => job.update(from + p * span) })
    void (async () => {
      setSpec(await analyzeSpectrogram(clip, { ...part(0, 0.4), window: o.specWindow }))
      setPitch(await analyzePitch(clip, { ...part(0.4, 0.3), minHz: o.f0Min, maxHz: o.f0Max }))
      setFormants(await analyzeFormants(clip, { ...part(0.7, 0.3), ceiling: o.formantCeiling }))
    })()
      .catch((e) => !ac.signal.aborted && onError(String(e)))
      .finally(job.end)
    return () => ac.abort()
    // onError は描画ごとに変わるので、依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, o.specWindow, o.f0Min, o.f0Max, o.formantCeiling])
  return { spec, pitch, formants, level }
}
