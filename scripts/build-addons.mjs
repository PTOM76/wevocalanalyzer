// 追加機能を <出力先>/addons/ に作る（今は歌詞の文字化 analyzer-lyrics だけ）
//   node scripts/build-addons.mjs          … dist（npm run build の後に実行する）
//   node scripts/build-addons.mjs public   … public（npm run dev でも使える）
// WeVocalSynth の scripts/build-addons.mjs と同じ形の manifest.json（ファイルの大きさとハッシュ、内容から決めた版）を書く
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, process.argv[2] ?? 'dist', 'addons')

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })
}

/** `dir` のファイル一式からマニフェストを書く。版は内容のハッシュ（中身が変わったときだけ更新を知らせる） */
export function writeManifest(id, dir, entry) {
  const files = listFiles(dir)
    .filter((p) => !p.endsWith('manifest.json'))
    .map((p) => {
      const data = readFileSync(p)
      return { path: relative(dir, p).replaceAll('\\', '/'), size: data.length, sha256: createHash('sha256').update(data).digest('hex') }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
  const version = createHash('sha256').update(files.map((f) => f.sha256).join()).digest('hex').slice(0, 12)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id, version, entry, files }, null, 2))
  const mb = files.reduce((s, f) => s + f.size, 0) / 2 ** 20
  console.log(`addon ${id} v${version}: ${files.length} files, ${mb.toFixed(1)} MB`)
}

execSync('npx vite build -c vite.addons.lyrics.config.ts', { cwd: root, stdio: 'inherit', env: { ...process.env, ADDONS_OUT: OUT } })
writeManifest('analyzer-lyrics', join(OUT, 'analyzer-lyrics'), 'index.js')
