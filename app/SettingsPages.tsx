import { useMemo, type ReactNode } from 'react'
import { UpdateSection } from 'pevenmui/pwa'
import { Check, Choice, Group, KeymapEditor, LANG_NAMES, Row, type WindowMode } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import type { Settings, ThemeSetting } from './settings'
import { ACTIONS, type KeymapOverrides } from './keymap'
import { useT, type LangSetting, type MessageKey } from './i18n'
import type { Category } from './settingsSearch'

/** 画面の大きさの選択肢（倍率） */
const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5]

/** ショートカットの割り当て（画面は PevenMUI の KeymapEditor。WeVocalSynth の ShortcutSection と同じ） */
function ShortcutSection({ keymap, onChange }: { keymap: KeymapOverrides; onChange: (keymap: KeymapOverrides) => void }) {
  const t = useT()
  const actions = useMemo(() => ACTIONS.map((a) => ({ ...a, label: t(a.label) })), [t])
  return <KeymapEditor actions={actions} overrides={keymap} onChange={onChange} />
}

/** 設定画面の分類ごとの中身（WeVocalSynth の SettingsPages と同じ並び）。項目を足したら settingsSearch.ts の検索の対象にも足す */
export function settingsPages(draft: Settings, set: (patch: Partial<Settings>) => void, t: (key: MessageKey) => string): Record<Category, ReactNode> {
  return {
    general: (
      <Group title={t('settings.groupUpdate')}>
        <UpdateSection />
      </Group>
    ),
    keys: (
      <>
        <Group title={t('settings.groupMouse')}>
          <Row label={t('settings.wheelZoom')}>
            <Choice<WheelZoom>
              value={draft.wheelZoom}
              onChange={(v) => set({ wheelZoom: v })}
              options={[
                ['ctrl', t('settings.wheelZoomCtrl')],
                ['wheel', t('settings.wheelZoomWheel')],
              ]}
            />
          </Row>
        </Group>
        <Group title={t('settings.groupShortcuts')}>
          <ShortcutSection keymap={draft.keymap} onChange={(keymap) => set({ keymap })} />
        </Group>
      </>
    ),
    display: (
      <Group title={t('settings.groupAppearance')}>
        <Row label={t('settings.theme')}>
          <Choice<ThemeSetting>
            value={draft.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              ['system', t('settings.themeSystem')],
              ['light', t('settings.themeLight')],
              ['dark', t('settings.themeDark')],
            ]}
          />
        </Row>
        <Row label={t('settings.uiScale')} help={t('settings.uiScaleHelp')}>
          <Choice<string>
            value={String(draft.uiScale)}
            onChange={(v) => set({ uiScale: Number(v) })}
            options={UI_SCALES.map((s): [string, string] => [String(s), `${Math.round(s * 100)}%`])}
          />
        </Row>
        <Row label={t('settings.language')}>
          <Choice<LangSetting> value={draft.language} onChange={(v) => set({ language: v })} options={[['auto', t('settings.languageAuto')], ...LANG_NAMES]} />
        </Row>
      </Group>
    ),
    debug: (
      <Group title={t('settings.groupDebug')}>
        <Check checked={draft.devUpdates} onChange={(v) => set({ devUpdates: v })} label={t('settings.devUpdates')} help={t('settings.devUpdatesHelp')} />
        <Row label={t('settings.dialogWindow')}>
          <Choice<WindowMode | 'auto'>
            value={draft.dialogWindow}
            onChange={(v) => set({ dialogWindow: v })}
            options={[
              ['auto', t('settings.auto')],
              ['dialog', t('settings.windowDialog')],
              ['nativeDialog', '<dialog>'],
              ['popover', 'Popover API'],
              ['popup', t('settings.windowPopup')],
              ['tab', t('settings.windowTab')],
              ['window', t('settings.windowSub')],
              ['pip', 'PiP'],
            ]}
          />
        </Row>
      </Group>
    ),
  }
}
