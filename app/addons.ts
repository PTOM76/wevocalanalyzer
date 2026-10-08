import { createAddons, type AddonInfo, type AddonsContextValue } from 'pevenmui'
import { createIdb } from 'pevenmui/web'
import { app } from './appConfig'
import { t, type MessageKey } from './i18n'

/** 追加機能。仕組みは PevenMUI（pevenmui/src/addons/）。ここは配信している一覧と、このアプリでの呼び名 */

/** 配信している追加機能（scripts/build-addons.mjs で作る） */
export const ADDONS: AddonInfo<MessageKey>[] = [
  // 歌詞の文字化（src/lyrics.ts。transformers.js と ONNX Runtime を含むので本体から分ける）
  { id: 'analyzer-lyrics', name: 'addon.lyrics' },
]

export const addons = createAddons({ appId: app.id, idb: createIdb(app.id), addons: ADDONS, base: import.meta.env.BASE_URL })

/** 部品とフックが使う追加機能（main.tsx の AddonsContext に入れる） */
export const addonsContext: AddonsContextValue = {
  addons,
  nameOf: (id, short) => {
    const info = ADDONS.find((a) => a.id === id)
    return info ? t((short && info.shortName) || info.name) : id
  },
}

/** 歌詞の文字化の追加機能の中身 */
export type LyricsAddon = typeof import('../src/lyrics')
