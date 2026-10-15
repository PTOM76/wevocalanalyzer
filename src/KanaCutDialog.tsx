// 一音ずつ切り出すダイアログ（文字化して読みを付け、一音ずつの範囲を求める）。WeVocalSynth と WeVocal Studio で共通（訳文、手順、設定はアプリが渡す）
import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Checkbox, DialogActions, FormControlLabel, DialogContent, LinearProgress, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { pevenFont, WindowDialog } from 'pevenmui'
import type { Clip, Range } from 'wevocal-lib'
import { hasWebGpu, LYRICS_MODEL_MB, type LyricsModel } from './lyricsTypes'
import type { createKanaHost, LyricsSegment, MoraMark } from './kanaCut'

const MODELS: LyricsModel[] = ['tiny', 'base', 'small']

/** このダイアログが使う訳文のキー（アプリの訳文に同じキーを置く） */
export type KanaCutKey =
  | 'kanaCut.model.tiny'
  | 'kanaCut.model.small'
  | 'kanaCut.model.base'
  | 'kanaCut.model'
  | 'common.cancel'
  | 'kanaCut.downloading'
  | 'kanaCut.empty'
  | 'kanaCut.failed'
  | 'kanaCut.find'
  | 'kanaCut.finding'
  | 'kanaCut.intro'
  | 'kanaCut.lyrics'
  | 'kanaCut.model'
  | 'kanaCut.noGpu'
  | 'kanaCut.reading'
  | 'kanaCut.readingsHelp'
  | 'kanaCut.target'
  | 'kanaCut.title'
  | 'kanaCut.transcribe'
  | 'kanaCut.transcribing'
  | 'kanaCut.vocalsFirst'
  | 'task.extractVocals'

interface Props {
  /** アプリの訳文（KanaCutKey のキーを持つ） */
  t: (key: KanaCutKey, vars?: Record<string, string | number>) => string
  /** 文字化と境目の手順（createKanaHost） */
  host: ReturnType<typeof createKanaHost>
  /** 先にボーカルを取り出すか（設定）と、それを変える */
  vocalBefore: boolean
  onVocalBeforeChange: (v: boolean) => void
  /** CPU で使うスレッドの数（0 は自動） */
  threads?: number
  open: boolean
  onClose: () => void
  clip: Clip
  /** 対象の範囲（選択範囲。なければ全体） */
  range: Range
  /** 追加機能の導入を確かめる（未導入なら導入のダイアログ。useAddonInstall の ensure） */
  ensure: (id: string) => Promise<boolean>
  /** 一音ずつの範囲が求まった（読みの帯に並べる） */
  onDone: (morae: MoraMark[]) => void
  /** ボーカルと伴奏に分ける関数を用意する（モデルを導入しなければ null。useVocalExtract） */
  prepareSeparate: () => Promise<((clip: Clip, onProgress: (p: number) => void, signal?: AbortSignal) => Promise<{ vocals: Float32Array[] }>) | null>
}

type Step = { kind: 'start' } | { kind: 'busy'; label: string; progress: number | null } | { kind: 'readings'; segments: LyricsSegment[] }

/** 一音ずつ切り出す: 文字化して読みを付け、読みを直してから、一音ずつの範囲を求める（memo/kana-cut.md） */
export default function KanaCutDialog(p: Props) {
  const t = p.t
  const { findMorae, transcribeRange } = p.host
  const [model, setModel] = useState<LyricsModel>('base')
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'start' })
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  // 範囲を求めるのに使う音（先にボーカルを取り出したら、その範囲をボーカルに置き換えた音。トラックの音は変えない）
  const source = useRef<Clip>(p.clip)

  useEffect(() => {
    if (!p.open) return
    setStep({ kind: 'start' })
    setError(null)
    source.current = p.clip
    void hasWebGpu().then(setGpu)
  }, [p.open])

  const close = () => {
    abort.current?.abort()
    p.onClose()
  }
  const fail = (e: unknown, back: Step) => {
    if (abort.current?.signal.aborted) return
    setError(t('kanaCut.failed', { message: e instanceof Error ? e.message : String(e) }))
    setStep(back)
  }

  const transcribe = async () => {
    // 文字化の処理と、選んだ大きさのモデル
    if (!(await p.ensure(`whisper-${model}`))) return
    const separate = p.vocalBefore ? await p.prepareSeparate() : null
    if (p.vocalBefore && !separate) return
    const ac = (abort.current = new AbortController())
    setError(null)
    source.current = p.clip
    if (separate) {
      const sr = p.clip.sampleRate
      const len = p.clip.channels[0]?.length ?? 0
      const s = Math.max(0, Math.min(len, Math.round(p.range.start * sr)))
      const e = Math.max(s, Math.min(len, Math.round(p.range.end * sr)))
      setStep({ kind: 'busy', label: t('task.extractVocals'), progress: 0 })
      try {
        const r = await separate({ sampleRate: sr, channels: p.clip.channels.map((c) => c.subarray(s, e)) }, (v) => setStep({ kind: 'busy', label: t('task.extractVocals'), progress: v }), ac.signal)
        if (ac.signal.aborted) return
        source.current = {
          sampleRate: sr,
          channels: p.clip.channels.map((c, i) => {
            const out = c.slice()
            out.set(r.vocals[Math.min(i, r.vocals.length - 1)].subarray(0, e - s), s)
            return out
          }),
        }
      } catch (e) {
        return fail(e, { kind: 'start' })
      }
    }
    setStep({ kind: 'busy', label: t('kanaCut.downloading', { percent: 0 }), progress: 0 })
    try {
      const segments = await transcribeRange(source.current, p.range.start, p.range.end, {
        model,
        device: 'webgpu',
        threads: p.threads,
        signal: ac.signal,
        onDownload: (v) => setStep({ kind: 'busy', label: t('kanaCut.downloading', { percent: Math.round(v * 100) }), progress: v }),
        onTranscribe: () => setStep({ kind: 'busy', label: t('kanaCut.transcribing'), progress: null }),
      })
      if (!segments.length) return fail(new Error(t('kanaCut.empty')), { kind: 'start' })
      setStep({ kind: 'readings', segments })
    } catch (e) {
      fail(e, { kind: 'start' })
    }
  }

  const find = async (segments: LyricsSegment[]) => {
    if (!(await p.ensure('analyzer'))) return
    const ac = (abort.current = new AbortController())
    setError(null)
    setStep({ kind: 'busy', label: t('kanaCut.finding'), progress: 0 })
    try {
      const morae = await findMorae(source.current, segments, (v) => setStep({ kind: 'busy', label: t('kanaCut.finding'), progress: v }), ac.signal)
      p.onDone(morae)
      p.onClose()
    } catch (e) {
      fail(e, { kind: 'readings', segments })
    }
  }

  const setReading = (i: number, patch: Partial<LyricsSegment>) => setStep((s) => (s.kind === 'readings' ? { ...s, segments: s.segments.map((v, j) => (j === i ? { ...v, ...patch } : v)) } : s))

  return (
    <WindowDialog open={p.open} onClose={close} title={t('kanaCut.title')} name="kanaCut" width={600} height={520} dialogProps={{ maxWidth: 'sm', fullWidth: true }}>
      <DialogContent>
        <Stack sx={{ gap: 1.5 }}>
          {step.kind !== 'readings' && (
            <>
              <Typography className="selectable" sx={{ fontSize: pevenFont('base') }}>
                {t('kanaCut.intro')}
              </Typography>
              <Typography className="selectable" sx={{ fontSize: pevenFont('md'), color: 'text.secondary' }}>
                {t('kanaCut.target', { start: p.range.start.toFixed(2), end: p.range.end.toFixed(2) })}
              </Typography>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: pevenFont('base'), minWidth: 80 }}>{t('kanaCut.model')}</Typography>
                <Select size="small" value={model} disabled={step.kind === 'busy'} onChange={(e) => setModel(e.target.value as LyricsModel)} sx={{ flex: 1, fontSize: pevenFont('base') }}>
                  {MODELS.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontSize: pevenFont('base') }}>
                      {t(`kanaCut.model.${m}`, { mb: LYRICS_MODEL_MB[m] })}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <FormControlLabel
                control={<Checkbox size="small" checked={p.vocalBefore} disabled={step.kind === 'busy'} onChange={(e) => p.onVocalBeforeChange(e.target.checked)} />}
                label={<Typography sx={{ fontSize: pevenFont('base') }}>{t('kanaCut.vocalsFirst')}</Typography>}
              />
              {gpu === false && <Alert severity="error">{t('kanaCut.noGpu')}</Alert>}
            </>
          )}
          {step.kind === 'busy' && (
            <Box>
              <LinearProgress variant={step.progress === null ? 'indeterminate' : 'determinate'} value={(step.progress ?? 0) * 100} />
              <Typography sx={{ fontSize: pevenFont('md'), mt: 0.5 }}>{step.label}</Typography>
            </Box>
          )}
          {step.kind === 'readings' && (
            <>
              <Typography className="selectable" sx={{ fontSize: pevenFont('md'), color: 'text.secondary' }}>
                {t('kanaCut.readingsHelp')}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 1, alignItems: 'center' }}>
                <span />
                <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary' }}>{t('kanaCut.lyrics')}</Typography>
                <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary' }}>{t('kanaCut.reading')}</Typography>
                {step.segments.map((s, i) => (
                  <Box key={i} sx={{ display: 'contents' }}>
                    <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{s.start.toFixed(1)}</Typography>
                    <Typography sx={{ fontSize: pevenFont('base') }}>{s.text}</Typography>
                    <TextField size="small" value={s.reading ?? ''} onChange={(e) => setReading(i, { reading: e.target.value })} sx={{ '& input': { fontSize: pevenFont('base') } }} />
                  </Box>
                ))}
              </Box>
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('common.cancel')}</Button>
        {step.kind === 'start' && (
          <Button disabled={!gpu} onClick={() => void transcribe()}>
            {t('kanaCut.transcribe')}
          </Button>
        )}
        {step.kind === 'readings' && <Button onClick={() => void find(step.segments)}>{t('kanaCut.find')}</Button>}
      </DialogActions>
    </WindowDialog>
  )
}
