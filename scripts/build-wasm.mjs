// dsp/（Rust）を wasm にビルドし、src/dsp.wasm にコピーする
//   wevocal-lib は、WEVOCAL_LIB_PATH、隣（WeVocalSynth の submodule として開発するとき）、自分の submodule の順に探して使う
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const has = (p) => existsSync(resolve(p, 'Cargo.toml'))
const lib = process.env.WEVOCAL_LIB_PATH ?? [resolve(root, '../wevocal-lib'), resolve(root, 'wevocal-lib')].find(has)
const patch = lib
  ? ` --config "patch.'https://github.com/PTOM76/wevocal-lib.git'.wevocal-lib.path='${resolve(lib).replaceAll('\\', '/')}'"`
  : ''
execSync(`cargo build --release --target wasm32-unknown-unknown${patch}`, { cwd: resolve(root, 'dsp'), stdio: 'inherit' })
copyFileSync(resolve(root, 'dsp/target/wasm32-unknown-unknown/release/wevocalanalyzer_dsp.wasm'), resolve(root, 'src/dsp.wasm'))
console.log('wasm -> src/dsp.wasm')
