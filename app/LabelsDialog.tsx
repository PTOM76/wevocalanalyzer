// ラベルの一覧と編集（文字を直す、範囲を選ぶ、消す）
import { useEffect, useState } from 'react'
import { Box, Button, DialogActions, DialogContent, IconButton, TextField, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import { pevenFont, WindowDialog } from 'pevenmui'
import { isPoint, sortLabels, type Label } from '../src/labels'
import { useT } from './i18n'

interface Props {
  open: boolean
  onClose: () => void
  labels: Label[]
  onSave: (labels: Label[]) => void
  /** ラベルの範囲を選択する（点なら再生位置を移す） */
  onPick: (label: Label) => void
}

const time = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`

export default function LabelsDialog(p: Props) {
  const t = useT()
  const [draft, setDraft] = useState(p.labels)
  useEffect(() => {
    if (p.open) setDraft(sortLabels(p.labels))
  }, [p.open, p.labels])
  const set = (i: number, text: string) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, text } : l)))
  return (
    <WindowDialog open={p.open} onClose={p.onClose} title={t('labels.title')} name="labels" width={560} height={520} dialogProps={{ maxWidth: 'sm', fullWidth: true }}>
      <DialogContent dividers>
        {!draft.length ? (
          <Typography sx={{ fontSize: pevenFont('md'), color: 'text.secondary' }}>{t('labels.empty')}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 1, alignItems: 'center' }}>
            {draft.map((l, i) => (
              <Box key={i} sx={{ display: 'contents' }}>
                <Button size="small" title={t('labels.pick')} onClick={() => p.onPick(l)} sx={{ fontSize: pevenFont('sm'), fontVariantNumeric: 'tabular-nums', justifyContent: 'flex-start' }}>
                  {isPoint(l) ? time(l.start) : `${time(l.start)}〜${time(l.end)}`}
                </Button>
                <TextField size="small" value={l.text} autoFocus={i === draft.length - 1 && !l.text} onChange={(e) => set(i, e.target.value)} sx={{ '& input': { fontSize: pevenFont('base') } }} />
                <IconButton size="small" sx={{ fontSize: pevenFont('sm') }} title={t('labels.delete')} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
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
