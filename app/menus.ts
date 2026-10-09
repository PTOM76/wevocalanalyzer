import type { MenuGroup } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import { t } from './i18n'
import { keyLabelOf, type ActionId, type Keymap } from './keymap'
import { LANES, type Lane, type LaneFlags } from './layout'
import { LANE_INFO } from './ViewTools'
import { openExternal, USER_GUIDE_URL } from './links'

/** メニューから呼ぶ操作と、チェックや押せるかに使う今の状態 */
export interface MenuActions {
  keymap: Keymap
  wheelZoom: WheelZoom
  hasClip: boolean
  hasSelection: boolean
  playing: boolean
  zoomed: boolean
  canZoomIn: boolean
  follow: boolean
  lanes: LaneFlags
  freqZoomed: boolean
  showFormants: boolean
  showHarmonics: boolean
  open: () => void
  /** 歌詞を文字化したか（SRT に書き出せるか）、書き出す、文字化のダイアログを開く */
  hasLyrics: boolean
  editLyrics: () => void
  hasReadings: boolean
  splitMorae: () => void
  exportSrt: () => void
  /** ラベルがあるか、付ける、一覧で直す、書き出す */
  hasLabels: boolean
  addLabel: () => void
  editLabels: () => void
  exportTextGrid: () => void
  exportLabelText: () => void
  transcribe: () => void
  /** 解析の結果（F0 など）があるか。CSV に書き出せるか */
  hasResults: boolean
  exportCsv: () => void
  showSettings: () => void
  toggleLane: (lane: Lane) => void
  freqZoomIn: () => void
  freqZoomOut: () => void
  freqZoomReset: () => void
  toggleFormants: () => void
  toggleHarmonics: () => void
  zoomIn: () => void
  zoomOut: () => void
  showAll: () => void
  toggleFollow: () => void
  togglePlay: () => void
  playSelection: () => void
  selectAll: () => void
  clearSelection: () => void
  stop: () => void
  seekStart: () => void
  seekEnd: () => void
  showShortcuts: () => void
  checkUpdate: () => void
  showLicenses: () => void
  showAbout: () => void
}

/**
 * メニューバー（PC）と ⋮ メニュー（スマホ）。並びは WeVocalSynth と同じ（docs/DECISIONS.md の「メニューの構成」）。
 * スマホでは、設定をヘルプに置き、ショートカット一覧は出さない
 */
export function appMenus(a: MenuActions, mobile: boolean): MenuGroup[] {
  const key = (id: ActionId) => keyLabelOf(a.keymap, id)
  const help: MenuGroup = {
    label: t('menu.help'),
    accessKey: 'H',
    entries: [
      ...(mobile ? [{ label: t('menu.settings'), onClick: a.showSettings }] : []),
      { label: t('menu.userGuide'), onClick: () => openExternal(USER_GUIDE_URL) },
      ...(mobile ? [] : [{ label: t('menu.shortcuts'), onClick: a.showShortcuts }]),
      { divider: true },
      { label: t('menu.checkUpdate'), onClick: a.checkUpdate },
      { label: t('menu.licenses'), onClick: a.showLicenses },
      { label: t('menu.about'), onClick: a.showAbout },
    ],
  }
  return [
    {
      label: t('menu.file'),
      accessKey: 'F',
      entries: [
        { label: t('menu.open'), shortcut: key('open'), onClick: a.open },
        { label: t(a.hasSelection ? 'menu.exportCsvSelection' : 'menu.exportCsv'), disabled: !a.hasResults, onClick: a.exportCsv },
        { label: t('menu.exportSrt'), disabled: !a.hasLyrics, onClick: a.exportSrt },
        { label: t('menu.exportTextGrid'), disabled: !a.hasLabels, onClick: a.exportTextGrid },
        { label: t('menu.exportLabelText'), disabled: !a.hasLabels, onClick: a.exportLabelText },
        ...(mobile ? [] : [{ divider: true as const }, { label: t('menu.settings'), onClick: a.showSettings }]),
      ],
    },
    {
      label: t('menu.edit'),
      accessKey: 'E',
      entries: [
        { label: t('edit.selectAll'), shortcut: key('selectAll'), disabled: !a.hasClip, onClick: a.selectAll },
        { label: t('edit.clearSelection'), shortcut: key('clearSelection'), disabled: !a.hasSelection, onClick: a.clearSelection },
      ],
    },
    {
      label: t('menu.view'),
      accessKey: 'V',
      entries: [
        ...LANES.map((l) => ({ label: t(LANE_INFO[l].label), checked: a.lanes[l], disabled: !a.hasClip || (a.lanes[l] && LANES.filter((x) => a.lanes[x]).length === 1), onClick: () => a.toggleLane(l) })),
        { label: t('analysis.formants'), checked: a.showFormants, disabled: !a.hasClip || !a.lanes.spec, onClick: a.toggleFormants },
        { label: t('analysis.harmonics'), checked: a.showHarmonics, disabled: !a.hasClip || !a.lanes.spec, onClick: a.toggleHarmonics },
        { divider: true },
        { label: t('wave.zoomIn'), shortcut: a.wheelZoom === 'wheel' ? 'Wheel' : 'Ctrl+Wheel', disabled: !a.hasClip || !a.canZoomIn, onClick: a.zoomIn },
        { label: t('wave.zoomOut'), disabled: !a.hasClip || !a.zoomed, onClick: a.zoomOut },
        { label: t('wave.showAll'), disabled: !a.hasClip || !a.zoomed, onClick: a.showAll },
        {
          label: t('lane.freqZoom'),
          disabled: !a.hasClip || !a.lanes.spec,
          submenu: [
            { label: t('wave.vZoomIn'), shortcut: 'Alt+Wheel', onClick: a.freqZoomIn },
            { label: t('wave.vZoomOut'), disabled: !a.freqZoomed, onClick: a.freqZoomOut },
            { label: t('wave.vZoomReset'), disabled: !a.freqZoomed, onClick: a.freqZoomReset },
          ],
        },
        { divider: true },
        { label: t('wave.follow'), checked: a.follow, onClick: a.toggleFollow },
      ],
    },
    {
      label: t('menu.play'),
      accessKey: 'P',
      entries: [
        { label: t(a.playing ? 'play.pause' : 'play.play'), shortcut: key('playPause'), disabled: !a.hasClip, onClick: a.togglePlay },
        { label: t('common.stop'), disabled: !a.hasClip, onClick: a.stop },
        { label: t('play.playSelection'), shortcut: key('playSelection'), disabled: !a.hasSelection, onClick: a.playSelection },
        { divider: true },
        { label: t('play.toStart'), shortcut: key('seekStart'), disabled: !a.hasClip, onClick: a.seekStart },
        { label: t('play.toEnd'), shortcut: key('seekEnd'), disabled: !a.hasClip, onClick: a.seekEnd },
      ],
    },
    { label: t('menu.tools'), accessKey: 'T', entries: [
        { label: t('menu.lyrics'), disabled: !a.hasClip, onClick: a.transcribe },
        { label: t('menu.editLyrics'), disabled: !a.hasLyrics, onClick: a.editLyrics },
        { label: t('menu.splitMorae'), disabled: !a.hasReadings, onClick: a.splitMorae },
        { divider: true },
        { label: t(a.hasSelection ? 'menu.addLabel' : 'menu.addPointLabel'), shortcut: key('addLabel'), disabled: !a.hasClip, onClick: a.addLabel },
        { label: t('menu.editLabels'), disabled: !a.hasLabels, onClick: a.editLabels },
      ],
    },
    help,
  ]
}
