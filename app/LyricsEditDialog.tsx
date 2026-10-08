import { useEffect, useState } from 'react'
import { Box, Button, DialogActions, DialogContent, TextField, Typography } from '@mui/material'
import { pevenFont, WindowDialog } from 'pevenmui'
import type { LyricsSegment } from '../src/lyricsTypes'
import { useT } from './i18n'

interface Props {
  open: boolean
  onClose: () => void
  lyrics: LyricsSegment[]
  onSave: (lyrics: LyricsSegment[]) => void
}

const time = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

/** 文字化した歌詞と読み（ひらがな）を区間ごとに直す */
export default function LyricsEditDialog(p: Props) {
  const t = useT()
  const [draft, setDraft] = useState(p.lyrics)
  useEffect(() => {
    if (p.open) setDraft(p.lyrics)
  }, [p.open, p.lyrics])
  const set = (i: number, patch: Partial<LyricsSegment>) => setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  return (
    <WindowDialog open={p.open} onClose={p.onClose} title={t('lyricsEdit.title')} name="lyricsEdit" width={640} height={560} dialogProps={{ maxWidth: 'md', fullWidth: true }}>
      <DialogContent dividers>
        <Typography sx={{ fontSize: pevenFont('md'), color: 'text.secondary', mb: 1.5 }}>{t('lyricsEdit.help')}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 1, alignItems: 'center' }}>
          <span />
          <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary' }}>{t('lyricsEdit.text')}</Typography>
          <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary' }}>{t('lyrics.reading')}</Typography>
          {draft.map((s, i) => (
            <Box key={i} sx={{ display: 'contents' }}>
              <Typography sx={{ fontSize: pevenFont('sm'), color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{time(s.start)}</Typography>
              <TextField size="small" value={s.text} onChange={(e) => set(i, { text: e.target.value })} sx={{ '& input': { fontSize: pevenFont('base') } }} />
              <TextField size="small" value={s.reading ?? ''} onChange={(e) => set(i, { reading: e.target.value })} sx={{ '& input': { fontSize: pevenFont('base') } }} />
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          onClick={() => {
            p.onSave(draft)
            p.onClose()
          }}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </WindowDialog>
  )
}
