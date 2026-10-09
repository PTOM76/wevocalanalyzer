// 比較の音声（B）。開く、閉じる、ずらす量と、その解析（memo/analyzer-compare.md）
import { useState } from 'react'
import { decodeFile, isWvspFile, readWvsp, type Clip } from 'wevocal-lib'
import { useAnalysis, type Analysis, type AnalysisOptions } from './useAnalysis'

export interface CompareSource {
  /** 表示の名前（ファイル名、トラック名など） */
  name: string
  clip: Clip
  /** B を A に対して遅らせる量（秒）。B の時刻 = A の時刻 − offset */
  offset: number
}

export interface Compare {
  source: CompareSource | null
  analysis: Analysis
  /** ファイルを B にする（.wvsp は編集していたトラックの加工後の音） */
  openFile: (file: File) => Promise<void>
  /** 開いている音声（トラック、加工前の音など）を B にする */
  setClip: (name: string, clip: Clip) => void
  setOffset: (offset: number) => void
  close: () => void
}

export function useCompare(o: AnalysisOptions, onError: (message: string) => void): Compare {
  const [source, setSource] = useState<CompareSource | null>(null)
  const analysis = useAnalysis(source?.clip ?? null, o, onError)
  const setClip = (name: string, clip: Clip) => setSource({ name, clip, offset: 0 })
  return {
    source,
    analysis,
    openFile: async (file) => {
      if (isWvspFile(file)) {
        const p = await readWvsp(file)
        const tr = p.tracks[p.active]
        setClip(`${file.name}（${tr.info.name}）`, tr.edited)
      } else setClip(file.name, await decodeFile(file))
    },
    setClip,
    setOffset: (offset) => setSource((s) => (s ? { ...s, offset } : s)),
    close: () => setSource(null),
  }
}
