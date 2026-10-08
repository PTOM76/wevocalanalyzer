// kuromoji が読み込む Node の path の代わり（辞書のファイルの場所を作る join だけ使う）。スラッシュの重なりは、スキームの後ろ以外を 1 つにする
export const join = (...parts: string[]) => parts.join('/').replace(/([^:])\/{2,}/g, '$1/')
export default { join }
