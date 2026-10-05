import type { MenuGroup } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import { t } from './i18n'
import { keyLabelOf, type ActionId, type Keymap } from './keymap'
import { openExternal, USER_GUIDE_URL } from './links'

/** メニューから呼ぶ操作と、チェックや押せるかに使う今の状態 */
export interface MenuActions {
  keymap: Keymap
  wheelZoom: WheelZoom
  hasClip: boolean
  playing: boolean
  zoomed: boolean
  canZoomIn: boolean
  follow: boolean
  showPitch: boolean
  showFormants: boolean
  open: () => void
  showSettings: () => void
  togglePitch: () => void
  toggleFormants: () => void
  zoomIn: () => void
  zoomOut: () => void
  showAll: () => void
  toggleFollow: () => void
  togglePlay: () => void
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
      entries: [{ label: t('menu.open'), shortcut: key('open'), onClick: a.open }, ...(mobile ? [] : [{ divider: true as const }, { label: t('menu.settings'), onClick: a.showSettings }])],
    },
    {
      label: t('menu.view'),
      accessKey: 'V',
      entries: [
        { label: t('menu.pitch'), checked: a.showPitch, disabled: !a.hasClip, onClick: a.togglePitch },
        { label: t('analysis.formants'), checked: a.showFormants, disabled: !a.hasClip, onClick: a.toggleFormants },
        { divider: true },
        { label: t('wave.zoomIn'), shortcut: a.wheelZoom === 'wheel' ? 'Wheel' : 'Ctrl+Wheel', disabled: !a.hasClip || !a.canZoomIn, onClick: a.zoomIn },
        { label: t('wave.zoomOut'), disabled: !a.hasClip || !a.zoomed, onClick: a.zoomOut },
        { label: t('wave.showAll'), disabled: !a.hasClip || !a.zoomed, onClick: a.showAll },
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
        { divider: true },
        { label: t('play.toStart'), shortcut: key('seekStart'), disabled: !a.hasClip, onClick: a.seekStart },
        { label: t('play.toEnd'), shortcut: key('seekEnd'), disabled: !a.hasClip, onClick: a.seekEnd },
      ],
    },
    help,
  ]
}
