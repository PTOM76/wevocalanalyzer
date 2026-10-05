import { Box, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material'
import type { Formants, Pitch } from '../src/index'
import { useT } from './i18n'
import { FORMANT_COLORS, valuesAt } from './lanes'

interface Props {
  pitch: Pitch | null
  formants: Formants | null
  /** 値を出す時刻（カーソルの下、なければ再生位置） */
  time: number
  /** カーソルの下の値か（偽なら再生位置） */
  hovering: boolean
  showFormants: boolean
  onShowFormantsChange: (v: boolean) => void
  showPitch: boolean
  onShowPitchChange: (v: boolean) => void
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

/** 解析の欄: 表示の切り替えと、時刻の F0、音名、F1〜F3 */
export default function AnalysisPanel(p: Props) {
  const t = useT()
  const v = valuesAt(p.time, p.pitch, p.formants)
  const hz = (x: number | undefined) => (x ? `${Math.round(x)} Hz` : '—')
  return (
    <Stack sx={{ p: 1.5, gap: 1.5 }}>
      <Box>
        <FormControlLabel control={<Checkbox size="small" checked={p.showPitch} onChange={(e) => p.onShowPitchChange(e.target.checked)} />} label={t('analysis.showPitch')} />
        <FormControlLabel control={<Checkbox size="small" checked={p.showFormants} onChange={(e) => p.onShowFormantsChange(e.target.checked)} />} label={t('analysis.showFormants')} />
      </Box>
      <Stack sx={{ gap: 0.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {t(p.hovering ? 'analysis.atCursor' : 'analysis.atPlayhead', { time: p.time.toFixed(2) })}
        </Typography>
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
    </Stack>
  )
}
