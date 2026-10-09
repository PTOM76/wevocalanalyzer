import { Divider, IconButton, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faAnglesRight, faBars, faChartArea, faCircleDot, faFont, faExpand, faMagnifyingGlassMinus, faMagnifyingGlassPlus, faMusic, faTag, faVolumeHigh, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import type { WheelZoom } from 'wevocal-lib/react'
import { useT, type MessageKey } from './i18n'
import { LANES, type Lane, type LaneFlags } from './layout'

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
  /** 出す帯（1 つは必ず残す） */
  lanes: LaneFlags
  onLaneToggle: (lane: Lane) => void
  showFormants: boolean
  onShowFormantsChange: (v: boolean) => void
  showHarmonics: boolean
  onShowHarmonicsChange: (v: boolean) => void
}

/** 帯ごとの名前とアイコン */
export const LANE_INFO: Record<Lane, { label: MessageKey; icon: IconDefinition }> = {
  wave: { label: 'lane.wave', icon: faWaveSquare },
  spec: { label: 'lane.spec', icon: faChartArea },
  f0: { label: 'analysis.f0', icon: faMusic },
  level: { label: 'lane.level', icon: faVolumeHigh },
  lyrics: { label: 'lane.lyrics', icon: faFont },
  labels: { label: 'lane.labels', icon: faTag },
}

/** 表示のツール（拡大縮小、追従、帯の表示、フォルマント）。PC はツールバー、スマホは波形のすぐ下に置く */
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
      {LANES.map((l) => (
        <SmallButton key={l} title={t(LANE_INFO[l].label)} icon={LANE_INFO[l].icon} pressed={p.lanes[l]} disabled={off || (p.lanes[l] && LANES.filter((x) => p.lanes[x]).length === 1)} onClick={() => p.onLaneToggle(l)} />
      ))}
      <SmallButton title={t('analysis.showFormants')} icon={faCircleDot} pressed={p.showFormants} disabled={off || !p.lanes.spec} onClick={() => p.onShowFormantsChange(!p.showFormants)} />
      <SmallButton title={t('analysis.harmonics')} icon={faBars} pressed={p.showHarmonics} disabled={off || !p.lanes.spec} onClick={() => p.onShowHarmonicsChange(!p.showHarmonics)} />
    </>
  )
}
