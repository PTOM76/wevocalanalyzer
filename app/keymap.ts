import { resolveKeymap as resolve, type Keymap as PevenKeymap, type KeyAction, type KeymapOverrides as PevenOverrides } from 'pevenmui'
import type { MessageKey } from './i18n'

/**
 * Analyzer の操作の一覧と既定のキー（WeVocalSynth の settings/keymap.ts と同じキーにそろえる）。
 * 割り当ての仕組み（キーの読み取り、表示の名前、設定の画面、keydown）は PevenMUI の keymap。設定で変えたものだけを `keymap` に保存する
 */
export { keyLabelOf } from 'pevenmui'

export type ActionId = 'playPause' | 'seekBack' | 'seekForward' | 'seekBackFine' | 'seekForwardFine' | 'seekStart' | 'seekEnd' | 'open'

/** 操作の一覧（設定の画面に出す順）。名前は訳文キー */
export const ACTIONS: (Omit<KeyAction<ActionId>, 'label'> & { label: MessageKey })[] = [
  { id: 'playPause', label: 'play.playPause', keys: ['Space'] },
  { id: 'seekBack', label: 'key.seekBack', keys: ['ArrowLeft'] },
  { id: 'seekForward', label: 'key.seekForward', keys: ['ArrowRight'] },
  { id: 'seekBackFine', label: 'key.seekBackFine', keys: ['Shift+ArrowLeft'] },
  { id: 'seekForwardFine', label: 'key.seekForwardFine', keys: ['Shift+ArrowRight'] },
  { id: 'seekStart', label: 'play.toStart', keys: ['Home'] },
  { id: 'seekEnd', label: 'play.toEnd', keys: ['End'] },
  { id: 'open', label: 'menu.open', keys: ['Ctrl+KeyO'] },
]

/** 設定に保存する、既定から変えた割り当て（空の配列はキーなし） */
export type KeymapOverrides = PevenOverrides<ActionId>
export type Keymap = PevenKeymap<ActionId>

export const resolveKeymap = (overrides: KeymapOverrides): Keymap => resolve(ACTIONS, overrides)
