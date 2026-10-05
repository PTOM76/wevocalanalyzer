import { useState } from 'react'
import type { WindowMode } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import type { LangSetting } from './i18n'
import type { KeymapOverrides } from './keymap'

export type ThemeSetting = 'system' | 'light' | 'dark'

/** アプリの設定（localStorage に保存する） */
export interface Settings {
  theme: ThemeSetting
  language: LangSetting
  /** 画面の大きさ（倍率。文字や入力欄などをまとめて拡大縮小する） */
  uiScale: number
  /** ホイールでの拡大縮小。ctrl は Ctrl+ホイールで拡大縮小（ホイールで横スクロール）、wheel はその逆 */
  wheelZoom: WheelZoom
  /** キーボードショートカットの、既定から変えた割り当て */
  keymap: KeymapOverrides
  /** 再生中に表示範囲を再生位置に追従させる */
  follow: boolean
  /** ピッチの帯を出す、フォルマントをスペクトログラムに重ねる */
  showPitch: boolean
  showFormants: boolean
  /** ダイアログの出し方。auto は PWA かつ Chromium 系ならポップアップ、ほかはダイアログ。別窓を開けなければダイアログ */
  dialogWindow: WindowMode | 'auto'
  /** 開発版の更新（バージョンが同じでコミットだけ違う版）も知らせる */
  devUpdates: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', language: 'auto', uiScale: 1, wheelZoom: 'ctrl', keymap: {}, follow: true, showPitch: true, showFormants: true, dialogWindow: 'auto', devUpdates: false }

const KEY = 'wevocalanalyzer.settings'

function load(): Settings {
  try {
    // 古い設定に無い項目は既定値で埋める
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** 設定と、一部を変えて保存する関数 */
export function useSettings() {
  const [settings, setSettings] = useState(load)
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // 保存できなくても、このセッション中は使う
      }
      return next
    })
  return [settings, update] as const
}
