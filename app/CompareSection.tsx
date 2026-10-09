// 右の欄の比較の項目（比較の音声の名前、ずらす量、自動でそろえる、その時刻と選択範囲の B の F0 と A との差）
import { Button, Stack, TextField, Typography } from '@mui/material'
import { pevenFont } from 'pevenmui'
import type { Range } from 'wevocal-lib'
import { findOffset, type Level, type Pitch } from '../src/index'
import { useT } from './i18n'
import { rangeStats, valuesAt } from './lanes'
import { Value } from './PanelValue'
import type { Compare } from './useCompare'

interface Props {
  compare: Compare
  /** A の F0 と強さ（自動でそろえる、差を出す） */
  pitch: Pitch | null
  level: Level | null
  time: number
  selection: Range | null
}

/** 2 つの F0 の差（セント）。どちらかが無声なら null */
const cents = (a: number, b: number) => (a > 0 && b > 0 ? 1200 * Math.log2(a / b) : null)
const signed = (c: number) => `${c >= 0 ? '+' : ''}${Math.round(c)}`

export default function CompareSection({ compare, pitch, level, time, selection }: Props) {
  const t = useT()
  const src = compare.source
  if (!src) return null
  const b = compare.analysis
  const hz = (x: number) => (x > 0 ? `${Math.round(x)} Hz` : '—')
  // B の値は、A の時刻から offset を引いた時刻のもの
  const va = valuesAt(time, pitch, null).f0
  const vb = valuesAt(time - src.offset, b.pitch, null).f0
  const d = cents(va, vb)
  const ra = selection ? rangeStats(selection.start, selection.end, pitch, null) : null
  const rb = selection ? rangeStats(selection.start - src.offset, selection.end - src.offset, b.pitch, null) : null
  const rd = ra && rb ? cents(ra.f0, rb.f0) : null
  return (
    <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary' }}>{t('compare.legend', { name: src.name })}</Typography>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          type="number"
          label={t('compare.offset')}
          value={src.offset}
          onChange={(e) => compare.setOffset(Number(e.target.value) || 0)}
          slotProps={{ htmlInput: { step: 0.01 } }}
          sx={{ width: 120, '& input': { fontSize: pevenFont('base') } }}
        />
        <Button size="small" disabled={!level || !b.level} onClick={() => level && b.level && compare.setOffset(findOffset(level, b.level))}>
          {t('compare.align')}
        </Button>
      </Stack>
      {!b.pitch ? (
        <Typography sx={{ fontSize: pevenFont('base'), color: 'text.secondary' }}>{t('analysis.analyzing')}</Typography>
      ) : (
        <>
          <Value label={t('compare.f0')} value={hz(vb)} />
          <Value label={t('compare.diff')} value={d === null ? '—' : t('compare.cents', { c: signed(d) })} />
          {ra && rb && (
            <>
              <Value label={t('compare.meanF0')} value={hz(rb.f0)} />
              <Value label={t('compare.meanDiff')} value={rd === null ? '—' : t('compare.cents', { c: signed(rd) })} />
            </>
          )}
        </>
      )}
    </Stack>
  )
}
