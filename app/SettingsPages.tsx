import { useMemo, type ReactNode } from 'react'
import { UpdateSection } from 'pevenmui/pwa'
import { Check, Choice, Group, KeymapEditor, LANG_NAMES, Row, type WindowMode } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import type { Settings, ThemeSetting } from './settings'
import { ACTIONS, type KeymapOverrides } from './keymap'
import { useT, type LangSetting, type MessageKey } from './i18n'
import type { Category } from './settingsSearch'

/** 解析の設定の選択肢: F0 を探す範囲（Hz）、フォルマントの最高周波数（Hz）、スペクトログラムの窓の長さ（サンプル） */
const F0_MINS = [40, 50, 60, 75, 100, 150]
const F0_MAXES = [300, 500, 600, 800, 1000, 1500]
const CEILINGS: [number, MessageKey][] = [
  [5000, 'settings.ceilingMale'],
  [5500, 'settings.ceilingFemale'],
  [8000, 'settings.ceilingChild'],
]
const WINDOWS = [512, 1024, 2048, 4096]

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
    analysis: (
      <>
        <Group title={t('settings.groupF0')}>
          <Row label={t('settings.f0Min')} help={t('settings.f0RangeHelp')}>
            <Choice<string> value={String(draft.f0Min)} onChange={(v) => set({ f0Min: Number(v) })} options={F0_MINS.map((hz): [string, string] => [String(hz), `${hz} Hz`])} />
          </Row>
          <Row label={t('settings.f0Max')}>
            <Choice<string> value={String(draft.f0Max)} onChange={(v) => set({ f0Max: Number(v) })} options={F0_MAXES.map((hz): [string, string] => [String(hz), `${hz} Hz`])} />
          </Row>
        </Group>
        <Group title={t('settings.groupFormant')}>
          <Row label={t('settings.formantCeiling')} help={t('settings.formantCeilingHelp')}>
            <Choice<string> value={String(draft.formantCeiling)} onChange={(v) => set({ formantCeiling: Number(v) })} options={CEILINGS.map(([hz, k]): [string, string] => [String(hz), `${hz} Hz（${t(k)}）`])} />
          </Row>
        </Group>
        <Group title={t('settings.groupSpec')}>
          <Row label={t('settings.specWindow')} help={t('settings.specWindowHelp')}>
            <Choice<string> value={String(draft.specWindow)} onChange={(v) => set({ specWindow: Number(v) })} options={WINDOWS.map((n): [string, string] => [String(n), `${n}`])} />
          </Row>
        </Group>
      </>
    ),
    debug: (
      <Group title={t('settings.groupDebug')}>
        <Check checked={draft.lyricsCpu} onChange={(v) => set({ lyricsCpu: v })} label={t('settings.lyricsCpu')} help={t('settings.lyricsCpuHelp')} />
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
