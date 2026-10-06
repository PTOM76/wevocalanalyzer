import { useState } from 'react'
import type { WindowMode } from 'pevenmui'
import type { WheelZoom } from 'wevocal-lib/react'
import type { LangSetting } from './i18n'
import type { KeymapOverrides } from './keymap'
import type { LaneFlags, LaneWeights } from './layout'
import type { LyricsModel } from '../src/lyrics'
import { app } from './appConfig'

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
  /** 出す帯（初めは波形とスペクトログラムだけ）と、帯の高さの比（境目のドラッグで変える） */
  lanes: LaneFlags
  laneWeights: LaneWeights
  /** フォルマントをスペクトログラムに重ねる、F0 の倍音（調波）の線を重ねる */
  showFormants: boolean
  showHarmonics: boolean
  /** 解析の設定: F0 を探す範囲（Hz）、フォルマントの最高周波数（Hz）、スペクトログラムの窓の長さ（サンプル） */
  f0Min: number
  f0Max: number
  formantCeiling: number
  specWindow: number
  /** 歌詞の文字化: モデルの大きさ、言語（null なら自動）、CPU でも動かすか（とても遅いので開発者向け） */
  lyricsModel: LyricsModel
  lyricsLanguage: string | null
  lyricsCpu: boolean
  /** ダイアログの出し方。auto は PWA かつ Chromium 系ならポップアップ、ほかはダイアログ。別窓を開けなければダイアログ */
  dialogWindow: WindowMode | 'auto'
  /** 開発版の更新（バージョンが同じでコミットだけ違う版）も知らせる */
  devUpdates: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', language: 'auto', uiScale: 1, wheelZoom: 'ctrl', keymap: {}, follow: true, lanes: { wave: true, spec: true, f0: false, level: false, lyrics: false }, laneWeights: { wave: 3, spec: 5, f0: 3, level: 2, lyrics: 1.5 }, showFormants: true, showHarmonics: false, f0Min: 60, f0Max: 1000, formantCeiling: 5500, specWindow: 2048, lyricsModel: 'base', lyricsLanguage: null, lyricsCpu: false, dialogWindow: 'auto', devUpdates: false }

const KEY = app.key('settings')

function load(): Settings {
  try {
    // 古い設定に無い項目は既定値で埋める
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // 帯は種類が増えても既定値で埋める
    return { ...DEFAULT_SETTINGS, ...saved, lanes: { ...DEFAULT_SETTINGS.lanes, ...saved.lanes }, laneWeights: { ...DEFAULT_SETTINGS.laneWeights, ...saved.laneWeights } }
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
