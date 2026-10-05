import { ShortcutsDialog as PevenShortcutsDialog, keymapRows } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import { useT, type MessageKey } from './i18n'
import { ACTIONS, type Keymap } from './keymap'

/** マウスなど、割り当てを変えられない操作: [キー（訳文キーまたはキー名）, 説明の訳文キー] */
const POINTER: [string | MessageKey, MessageKey][] = [
  ['shortcuts.drag', 'shortcuts.select'],
  ['shortcuts.rulerDrag', 'shortcuts.seek'],
  ['shortcuts.edgeDrag', 'shortcuts.adjustRange'],
  ['shortcuts.wheel', 'shortcuts.scrollZoom'],
]

/** キーボード・マウス操作の一覧（WeVocalSynth と同じ形）。キーボードは今の割り当てを、キーのある操作だけ並べる */
export default function ShortcutsDialog({ open, onClose, keymap, wheelZoom }: { open: boolean; onClose: () => void; keymap: Keymap; wheelZoom: WheelZoom }) {
  const t = useT()
  // 'shortcuts.' で始まるものは訳文キー、それ以外はキー名そのもの
  const keyLabel = (k: string) => (k.startsWith('shortcuts.') ? t(k as MessageKey) : k)
  const keys = keymapRows(ACTIONS.map((a) => ({ id: a.id, label: t(a.label) })), keymap)
  return (
    <PevenShortcutsDialog
      open={open}
      onClose={onClose}
      title={t('menu.shortcuts')}
      // ホイールだけで拡大縮小する設定なら、ホイールの説明を入れ替える
      rows={[...keys, ...POINTER.map(([key, desc]): [string, string] => [keyLabel(key), t(desc === 'shortcuts.scrollZoom' && wheelZoom === 'wheel' ? 'shortcuts.zoomScroll' : desc)])]}
    />
  )
}
