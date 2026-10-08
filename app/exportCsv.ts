import { downloadBlob, type Range } from 'wevocal-lib'
import type { Formants, Level, Pitch } from '../src/index'
import type { LyricsSegment } from '../src/lyricsTypes'

/**
 * 解析の結果を CSV にする（10ms ごとに 1 行。時刻、F0、F1〜F3、強さ）。範囲があればその中だけ。
 * 無声区間の F0 とフォルマントは空欄（0 にすると、表計算で平均を取ったときに値が狂うため）
 */
export function analysisCsv(pitch: Pitch, formants: Formants | null, level: Level | null, range: Range | null): string {
  const hop = pitch.hopSec
  const k0 = range ? Math.max(0, Math.ceil(range.start / hop)) : 0
  const k1 = range ? Math.min(pitch.data.length - 1, Math.floor(range.end / hop)) : pitch.data.length - 1
  const count = formants?.count ?? 0
  const head = ['time_s', 'f0_hz', ...Array.from({ length: count }, (_, i) => `f${i + 1}_hz`), 'level_db']
  const rows = [head.join(',')]
  for (let k = k0; k <= k1; k++) {
    const f0 = pitch.data[k]
    const fs = Array.from({ length: count }, (_, i) => {
      const v = formants!.data[k * count + i]
      return f0 > 0 && v > 0 ? v.toFixed(1) : ''
    })
    const lv = level && k < level.data.length ? level.data[k].toFixed(1) : ''
    rows.push([(k * hop).toFixed(2), f0 > 0 ? f0.toFixed(2) : '', ...fs, lv].join(','))
  }
  return rows.join('\n') + '\n'
}

/** CSV を保存する。名前は「元のファイル名_analysis.csv」 */
export function downloadAnalysisCsv(fileName: string, csv: string) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'analysis'
  // 表計算ソフトが UTF-8 と分かるように BOM を付ける
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv' }), `${base}_analysis.csv`)
}

/** 秒を SRT の時刻（00:01:02,345）にする */
const srtTime = (sec: number) => {
  const ms = Math.round(sec * 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

/** 歌詞を SRT（字幕の形式）で保存する。名前は「元のファイル名_lyrics.srt」 */
export function downloadLyricsSrt(fileName: string, segments: LyricsSegment[]) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'lyrics'
  const srt = segments.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n')
  downloadBlob(new Blob([srt], { type: 'text/plain' }), `${base}_lyrics.srt`)
}
