// kuromoji（読みを付ける形態素解析）の辞書の読み込み。Worker でも画面でも使える
import kuromoji, { type IpadicFeatures, type Tokenizer } from 'kuromoji'
import BrowserDictionaryLoader from 'kuromoji/src/loader/BrowserDictionaryLoader.js'

// 辞書は .dat.bin の名前で置く（.gz だと Content-Encoding: gzip を付けて返す配信先があり、ブラウザが先に展開して導入の確認が合わなくなる）。
// 読み込みも差し替え、圧縮のままでも展開済みでも読めるようにする
BrowserDictionaryLoader.prototype.loadArrayBuffer = (url, callback) => {
  fetch(url.replace(/\.dat\.gz$/, '.dat.bin'))
    .then(async (res) => {
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      const buf = new Uint8Array(await res.arrayBuffer())
      // gzip の印（1f 8b）があれば展開する
      if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf.buffer
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    })
    .then((b) => callback(null, b), (e) => callback(e, null))
}

/** `dicPath`（URL のパス。kuromoji は URL の // を潰すので、スキームを付けない）の辞書で形態素解析を用意する */
export function loadTokenizer(dicPath: string): Promise<Tokenizer<IpadicFeatures>> {
  return new Promise((resolve, reject) => kuromoji.builder({ dicPath }).build((err, tk) => (err ? reject(err) : resolve(tk))))
}
