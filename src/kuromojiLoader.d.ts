// kuromoji のブラウザ向けの辞書の読み込み（型がないので、差し替える関数だけを書く。lyricsWorker.ts）
declare module 'kuromoji/src/loader/BrowserDictionaryLoader.js' {
  const BrowserDictionaryLoader: {
    prototype: { loadArrayBuffer(url: string, callback: (err: unknown, buffer: ArrayBuffer | null) => void): void }
  }
  export default BrowserDictionaryLoader
}
