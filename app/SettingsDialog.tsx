import { SettingsDialog as PevenSettingsDialog } from 'pevenmui'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { useT } from './i18n'
import { settingsCategories } from './settingsSearch'
import { settingsPages } from './SettingsPages'

/**
 * 設定画面（WeVocalSynth と同じ形）。PC は左の分類から選んで右で変え、「OK」「適用」で反映・保存、「キャンセル」なら捨てる。
 * スマホは分類の一覧から各画面へ進み、変更はその場で反映する（外枠は PevenMUI の SettingsDialog）
 */
export default function SettingsDialog(p: { open: boolean; onClose: () => void; focusSignal?: number; settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const t = useT()
  return (
    <PevenSettingsDialog
      open={p.open}
      focusSignal={p.focusSignal}
      onClose={p.onClose}
      title={t('settings.title')}
      settings={p.settings}
      defaults={DEFAULT_SETTINGS}
      onChange={p.onChange}
      categories={settingsCategories(t)}
      initial="general"
      pages={(draft, set) => settingsPages(draft, set, t)}
    />
  )
}
