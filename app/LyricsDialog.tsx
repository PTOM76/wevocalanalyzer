import { useEffect, useState } from 'react'
import { Alert, Button, DialogActions, DialogContent, MenuItem, Select, Stack, Typography } from '@mui/material'
import { WindowDialog } from 'pevenmui'
import { hasWebGpu, LYRICS_MODEL_MB, type LyricsModel } from '../src/lyricsTypes'
import { useT, type MessageKey } from './i18n'

/** 選べる言語（transformers.js の名前）。null は自動 */
const LANGUAGES: [string | null, MessageKey][] = [
  [null, 'lyrics.langAuto'],
  ['japanese', 'lyrics.langJa'],
  ['english', 'lyrics.langEn'],
  ['korean', 'lyrics.langKo'],
  ['chinese', 'lyrics.langZh'],
]
const MODELS: LyricsModel[] = ['tiny', 'base', 'small']

interface Props {
  open: boolean
  onClose: () => void
  model: LyricsModel
  language: string | null
  /** WebGPU がないときも CPU で動かすか（開発者向けの設定） */
  allowCpu: boolean
  onChange: (patch: { lyricsModel?: LyricsModel; lyricsLanguage?: string | null }) => void
  /** 文字化を始める（進み具合はステータスバー。ダイアログは閉じる） */
  onRun: (device: 'webgpu' | 'wasm') => void
}

/**
 * 歌詞の文字化（Whisper）の設定と実行。モデルは初めて使うときに取得し、ブラウザに保存する。
 * WebGPU がなければ使えない（CPU はとても遅いので、開発者向けの設定で許したときだけ）
 */
export default function LyricsDialog(p: Props) {
  const t = useT()
  const [gpu, setGpu] = useState<boolean | null>(null)
  useEffect(() => {
    if (p.open) void hasWebGpu().then(setGpu)
  }, [p.open])
  const device = gpu ? 'webgpu' : p.allowCpu ? 'wasm' : null
  return (
    <WindowDialog open={p.open} onClose={p.onClose} title={t('lyrics.title')} name="lyrics" width={480} height={420} dialogProps={{ maxWidth: 'xs', fullWidth: true }}>
      <DialogContent>
        <Stack sx={{ gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('lyrics.intro')}
          </Typography>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 13, minWidth: 80 }}>{t('lyrics.model')}</Typography>
            <Select size="small" value={p.model} onChange={(e) => p.onChange({ lyricsModel: e.target.value as LyricsModel })} sx={{ flex: 1, fontSize: 13 }}>
              {MODELS.map((m) => (
                <MenuItem key={m} value={m} sx={{ fontSize: 13 }}>
                  {t(`lyrics.model.${m}`, { mb: LYRICS_MODEL_MB[m] })}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 13, minWidth: 80 }}>{t('lyrics.language')}</Typography>
            <Select size="small" value={p.language ?? ''} onChange={(e) => p.onChange({ lyricsLanguage: e.target.value || null })} sx={{ flex: 1, fontSize: 13 }}>
              {LANGUAGES.map(([v, k]) => (
                <MenuItem key={k} value={v ?? ''} sx={{ fontSize: 13 }}>
                  {t(k)}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          {gpu === false && <Alert severity={p.allowCpu ? 'warning' : 'error'}>{t(p.allowCpu ? 'lyrics.cpuSlow' : 'lyrics.noGpu')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!device}
          onClick={() => {
            if (!device) return
            p.onRun(device)
            p.onClose()
          }}
        >
          {t('lyrics.run')}
        </Button>
      </DialogActions>
    </WindowDialog>
  )
}
