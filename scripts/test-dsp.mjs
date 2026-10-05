// dsp/（Rust）のテストを走らせる
//   wevocal-lib は、WEVOCAL_LIB_PATH、隣（WeVocalSynth の submodule として開発するとき）、自分の submodule の順に探して使う（build-wasm.mjs と同じ）
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const has = (p) => existsSync(resolve(p, 'Cargo.toml'))
const lib = process.env.WEVOCAL_LIB_PATH ?? [resolve(root, '../wevocal-lib'), resolve(root, 'wevocal-lib')].find(has)
const patch = lib ? ` --config "patch.'https://github.com/PTOM76/wevocal-lib.git'.wevocal-lib.path='${resolve(lib).split('\\').join('/')}'"` : ''
execSync(`cargo test --release${patch}`, { cwd: resolve(root, 'dsp'), stdio: 'inherit' })
