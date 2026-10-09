import { Box, Stack, Typography } from '@mui/material'
import type { Clip, Range } from 'wevocal-lib'
import { useMemo } from 'react'
import { analyzeF0Histogram, analyzeVibrato, analyzeVoiceQuality, type Formants, type Level, type Pitch, type Spectrogram } from '../src/index'
import type { LyricsSegment } from '../src/lyricsTypes'
import SpectrumPlot, { spectrumOf } from './SpectrumPlot'
import F0HistogramPlot from './F0HistogramPlot'
import { useT } from './i18n'
import { useLoudness } from './useLoudness'
import { FORMANT_COLORS, levelAt, midiName, lyricSegmentAt, meanLevel, noteOf, rangeStats, valuesAt } from './lanes'

interface Props {
  clip: Clip | null
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

/** 声の質を測る選択範囲の長さの上限（秒） */
const VOICE_MAX_SEC = 10

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
  const dur = p.clip ? (p.clip.channels[0]?.length ?? 0) / p.clip.sampleRate : null
  const whole = useLoudness(p.clip, 0, dur)
  const part = useLoudness(p.clip, p.selection?.start ?? null, p.selection?.end ?? null)
  const vib = p.selection && p.pitch ? analyzeVibrato(p.pitch, p.selection.start, p.selection.end) : null
  // F0 の分布（選択範囲があればその中、なければ全体）と、全体の平均スペクトル（LTAS）
  const sel0 = p.selection?.start ?? 0
  const sel1 = p.selection?.end ?? Infinity
  const hist = useMemo(() => (p.pitch ? analyzeF0Histogram(p.pitch, sel0, sel1) : null), [p.pitch, sel0, sel1])
  const ltas = useMemo(() => (p.spec ? spectrumOf(p.spec, 0, Infinity) : null), [p.spec])
  // 声の質（長い範囲は重いので、VOICE_MAX_SEC まで）
  const longSel = sel1 - sel0 > VOICE_MAX_SEC
  const voice = useMemo(
    () => (p.clip && p.pitch && p.selection && !longSel ? analyzeVoiceQuality(p.clip.channels, p.clip.sampleRate, p.pitch, sel0, sel1) : null),
    [p.clip, p.pitch, p.selection, longSel, sel0, sel1],
  )
  const lufs = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(1)} LUFS`)
  const dbtp = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(1)} dBTP`)
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
              <Value label={t('analysis.vibrato')} value={vib ? t('analysis.vibratoValue', { rate: vib.rate.toFixed(1), depth: Math.round(vib.depth) }) : t('analysis.vibratoNone')} />
              {voice ? (
                <>
                  <Value label={t('analysis.jitter')} value={`${voice.jitter.toFixed(2)}%`} />
                  <Value label={t('analysis.shimmer')} value={`${voice.shimmer.toFixed(2)}%`} />
                  <Value label="HNR" value={`${voice.hnr.toFixed(1)} dB`} />
                </>
              ) : (
                longSel && <Value label={t('analysis.voiceQuality')} value={t('analysis.voiceTooLong', { sec: VOICE_MAX_SEC })} />
              )}
              <Value label={t('analysis.meanLevel')} value={db(meanLevel(p.selection!.start, p.selection!.end, p.level))} />
              {r.formants.map((f, i) => (
                <Value key={i} label={t('analysis.meanFormant', { n: i + 1 })} value={hz(f)} color={FORMANT_COLORS[i]} />
              ))}
            </>
          ) : (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('analysis.unvoiced')}</Typography>
          )}
          <Value label={t('analysis.loudness')} value={lufs(part?.lufs)} />
          <Value label={t('analysis.truePeak')} value={dbtp(part?.truePeak)} />
        </Stack>
      )}
      {p.clip && (
        <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('analysis.whole')}</Typography>
          <Value label={t('analysis.loudness')} value={lufs(whole?.lufs)} />
          <Value label={t('analysis.truePeak')} value={dbtp(whole?.truePeak)} />
        </Stack>
      )}
      {p.spec && spectrum && (
        <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t(p.selection ? 'analysis.spectrumSelection' : 'analysis.spectrumAt')}</Typography>
          <SpectrumPlot spec={p.spec} values={spectrum} formants={(p.selection ? r?.formants : v.formants) ?? []} />
        </Stack>
      )}
      {hist && (
        <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t(p.selection ? 'analysis.f0HistSelection' : 'analysis.f0HistWhole')}</Typography>
          <Value
            label={t('analysis.f0Range')}
            value={`${midiName(hist.low)}〜${midiName(hist.low + hist.counts.length - 1)}（${t('analysis.f0Mode', { note: midiName(hist.low + hist.counts.indexOf(Math.max(...hist.counts))) })}）`}
          />
          <F0HistogramPlot hist={hist} />
        </Stack>
      )}
      {p.spec && ltas && (
        <Stack sx={{ gap: 0.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('analysis.ltas')}</Typography>
          <SpectrumPlot spec={p.spec} values={ltas} formants={[]} />
        </Stack>
      )}
    </Stack>
  )
}
