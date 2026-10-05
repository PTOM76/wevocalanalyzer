import { Divider, IconButton, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faAnglesRight, faCircleDot, faExpand, faMagnifyingGlassMinus, faMagnifyingGlassPlus, faMusic } from '@fortawesome/free-solid-svg-icons'
import type { WheelZoom } from 'wevocal-lib/react'
import { useT } from './i18n'

/** ツールチップ付きの小さいアイコンボタン。`pressed` を渡すと ON/OFF の切替ボタンになる（WeVocalSynth の SmallButton と同じ） */
export function SmallButton(p: { title: string; icon: IconDefinition; pressed?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Tooltip title={p.title}>
      <span>
        <IconButton aria-label={p.title} aria-pressed={p.pressed} size="small" color={p.pressed ? 'primary' : 'default'} disabled={p.disabled} onClick={p.onClick}>
          <FontAwesomeIcon icon={p.icon} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

interface Props {
  disabled: boolean
  /** ホイールだけで拡大縮小する設定か（ツールチップの操作の説明を変える） */
  wheelZoom: WheelZoom
  zoomed: boolean
  canZoomIn: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onShowAll: () => void
  follow: boolean
  onFollowChange: (v: boolean) => void
  showPitch: boolean
  onShowPitchChange: (v: boolean) => void
  showFormants: boolean
  onShowFormantsChange: (v: boolean) => void
}

/** 表示のツール（拡大縮小、追従、ピッチとフォルマントの表示）。PC はツールバー、スマホは波形のすぐ下に置く */
export default function ViewTools(p: Props) {
  const t = useT()
  const off = p.disabled
  const hint = (action: 'wave.zoomOut' | 'wave.zoomIn') => t(p.wheelZoom === 'wheel' ? 'wave.wheelHintPlain' : 'wave.wheelHint', { action: t(action) })
  return (
    <>
      <SmallButton title={hint('wave.zoomOut')} icon={faMagnifyingGlassMinus} disabled={off || !p.zoomed} onClick={p.onZoomOut} />
      <SmallButton title={hint('wave.zoomIn')} icon={faMagnifyingGlassPlus} disabled={off || !p.canZoomIn} onClick={p.onZoomIn} />
      <SmallButton title={t('wave.showAll')} icon={faExpand} disabled={off || !p.zoomed} onClick={p.onShowAll} />
      <SmallButton title={t('wave.follow')} icon={faAnglesRight} pressed={p.follow} disabled={off} onClick={() => p.onFollowChange(!p.follow)} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <SmallButton title={t('analysis.showPitch')} icon={faMusic} pressed={p.showPitch} disabled={off} onClick={() => p.onShowPitchChange(!p.showPitch)} />
      <SmallButton title={t('analysis.showFormants')} icon={faCircleDot} pressed={p.showFormants} disabled={off} onClick={() => p.onShowFormantsChange(!p.showFormants)} />
    </>
  )
}
