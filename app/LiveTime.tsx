import { useEffect, useState } from 'react'
import { ButtonBase, InputBase } from '@mui/material'
import { useT } from './i18n'

// WeVocalSynth の src/components/LiveTime.tsx を写したもの（再生の操作は Synth に残し、Analyzer は写す）

/** 秒を「分:秒.ミリ秒」で表す */
export function formatTime(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

/** 「分:秒」「時:分:秒」「秒」の文字を秒にする（小数可）。読めなければ null */
function parseTime(text: string): number | null {
  const parts = text.trim().replace(/：/g, ':').split(':')
  if (parts.length > 3 || parts.some((x) => !/^\d*\.?\d+$|^\d+\.?$/.test(x))) return null
  return parts.reduce((s, x) => s * 60 + Number(x), 0)
}

/** 再生中の今の位置を、この部品の中だけで `intervalMs` ごとに読む（画面全体を描き直さないため） */
function useLivePosition(position: number, playing: boolean, livePosition: () => number, intervalMs: number): number {
  const [live, setLive] = useState(position)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setLive(livePosition()), intervalMs)
    return () => clearInterval(timer)
  }, [playing, livePosition, intervalMs])
  return playing ? live : position
}

/** 表示を更新する間隔（ミリ秒）。時間の数字が読める速さで十分 */
const UPDATE_MS = 100

/**
 * 「再生位置 / 長さ」の表示。再生中はこの部品だけが自分で更新する。
 * `onSeek` を渡すと、再生位置を押して数字を直接入れられる（Enter で移動、Esc でやめる）。
 * `editRequest` が変わったら入力を始める（目盛りの右クリックメニューから）
 */
export default function LiveTime(p: { position: number; playing: boolean; livePosition: () => number; duration: number; onSeek?: (t: number) => void; editRequest?: number }) {
  const t = useT()
  const now = useLivePosition(p.position, p.playing, p.livePosition, UPDATE_MS)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const start = () => {
    setDraft(formatTime(p.livePosition()))
    setError(false)
  }
  useEffect(() => {
    if (p.editRequest) start()
    // 頼まれたときだけ始める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editRequest])

  const commit = () => {
    const v = draft === null ? null : parseTime(draft)
    if (v === null) return setError(true)
    p.onSeek?.(Math.max(0, Math.min(p.duration, v)))
    setDraft(null)
  }

  return (
    <>
      {draft !== null ? (
        <InputBase
          autoFocus
          value={draft}
          error={error}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(false)
          }}
          onFocus={(e) => e.target.select()}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setDraft(null)
          }}
          inputProps={{ 'aria-label': t('time.input'), style: { padding: 0, width: '9ch', fontFamily: 'monospace', fontSize: 'inherit' } }}
          sx={{ fontSize: 'inherit', lineHeight: 'inherit', verticalAlign: 'baseline', borderBottom: 1, borderColor: error ? 'error.main' : 'primary.main' }}
        />
      ) : p.onSeek ? (
        // ボタンの箱で文字の高さがずれないよう、ふつうの文字と同じ並びにする
        <ButtonBase
          component="span"
          title={t('time.input')}
          onClick={start}
          sx={{ display: 'inline', verticalAlign: 'baseline', font: 'inherit', lineHeight: 'inherit', p: 0, borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
        >
          {formatTime(now)}
        </ButtonBase>
      ) : (
        formatTime(now)
      )}{' '}
      / {formatTime(p.duration)}
    </>
  )
}
