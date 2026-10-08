import { Box, Stack, Typography } from '@mui/material'
import type { Range } from 'wevocal-lib'
import { useMemo } from 'react'
import type { Formants, Level, Pitch, Spectrogram } from '../src/index'
import type { LyricsSegment } from '../src/lyricsTypes'
import SpectrumPlot, { spectrumOf } from './SpectrumPlot'
import { useT } from './i18n'
import { FORMANT_COLORS, levelAt, lyricSegmentAt, meanLevel, noteOf, rangeStats, valuesAt } from './lanes'

interface Props {
  spec: Spectrogram | null
  lyrics: LyricsSegment[] | null
  pitch: Pitch | null
  formants: Formants | null
  level: Level | null
  /** カーソルの高さの周波数（スペクトログラムか F0 の帯の上だけ） */
  hoverHz: number | null
  /** 値を出す時刻（カーソルの下、なければ再生位置） */
  time: number
  /** カーソルの下の値か（偽なら再生位置） */
  hovering: boolean
  /** 選択範囲（あれば、その平均を出す） */
  selection: Range | null
}

/** 1 行の値（名前と数値。色の印があればその前に出す） */
function Value({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, fontSize: 13 }}>
      {color && <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: 0.5 }} />}
      <Typography sx={{ fontSize: 13, color: 'text.secondary', minWidth: 72 }}>{label}</Typography>
      <Typography className="selectable" sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  )
}

/** 解析の欄: 時刻の F0、音名、F1〜F3 と、選択範囲の平均（表示の切り替えはツールバーとメニュー） */
export default function AnalysisPanel(p: Props) {
  const t = useT()
  const v = valuesAt(p.time, p.pitch, p.formants)
  const hz = (x: number | undefined) => (x ? `${Math.round(x)} Hz` : '—')
  const r = p.selection ? rangeStats(p.selection.start, p.selection.end, p.pitch, p.formants) : null
  const db = (x: number | null) => (x === null ? '—' : `${x.toFixed(1)} dB`)
  const lv = levelAt(p.time, p.level)
  const lyric = lyricSegmentAt(p.time, p.lyrics)
  // スペクトル: 選択範囲があればその平均、なければその時点
  const [s0, s1] = p.selection ? [p.selection.start, p.selection.end] : [p.time, p.time]
  const spectrum = useMemo(() => (p.spec ? spectrumOf(p.spec, s0, s1) : null), [p.spec, s0, s1])
  return (
    <Stack sx={{ p: 1.5, gap: 1.5 }}>
      <Stack sx={{ gap: 0.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {t(p.hovering ? 'analysis.atCursor' : 'analysis.atPlayhead', { time: p.time.toFixed(2) })}
        </Typography>
        {p.hoverHz !== null && <Value label={t('analysis.cursorFreq')} value={`${hz(p.hoverHz)}（${noteOf(p.hoverHz)}）`} />}
        <Value label={t('lane.level')} value={db(lv)} />
        {p.lyrics && <Value label={t('lane.lyrics')} value={lyric?.text || '—'} />}
        {lyric?.reading && <Value label={t('lyrics.reading')} value={lyric.reading} />}
        {!p.pitch ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('analysis.analyzing')}</Typography>
        ) : v.f0 > 0 ? (
          <>
            <Value label="F0" value={`${hz(v.f0)}（${v.note}）`} />
            {v.formants.map((f, i) => (
              <Value key={i} label={`F${i + 1}`} value={hz(f)} color={FORMANT_COLORS[i]} />
            ))}
          </>
        ) : (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('analysis.unvoiced')}</Typography>
        )}
      </Stack>
      {p.selection && (
        <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {t('analysis.selection', { start: p.selection.start.toFixed(2), end: p.selection.end.toFixed(2), dur: (p.selection.end - p.selection.start).toFixed(2) })}
          </Typography>
          {!r ? (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('analysis.analyzing')}</Typography>
          ) : r.f0 > 0 ? (
            <>
              <Value label={t('analysis.meanF0')} value={`${hz(r.f0)}（${r.note}）`} />
              <Value label={t('analysis.voiced')} value={`${Math.round(r.voicedRatio * 100)}%`} />
              <Value label={t('analysis.meanLevel')} value={db(meanLevel(p.selection!.start, p.selection!.end, p.level))} />
              {r.formants.map((f, i) => (
                <Value key={i} label={t('analysis.meanFormant', { n: i + 1 })} value={hz(f)} color={FORMANT_COLORS[i]} />
              ))}
            </>
          ) : (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('analysis.unvoiced')}</Typography>
          )}
        </Stack>
      )}
      {p.spec && spectrum && (
        <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t(p.selection ? 'analysis.spectrumSelection' : 'analysis.spectrumAt')}</Typography>
          <SpectrumPlot spec={p.spec} values={spectrum} formants={(p.selection ? r?.formants : v.formants) ?? []} />
        </Stack>
      )}
    </Stack>
  )
}
