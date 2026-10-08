// 一音ずつの境目を、手元の録音で確かめる（sample/kana-commons/ の一音ずつの録音をつなぎ、つないだ位置と比べる）。
//   node scripts/test-mora.mjs [フォルダー]   … 既定は ../sample/kana-commons（Synth の submodule として開発するとき）
// 先に npm run build:wasm で src/dsp.wasm を作る。音声の読み込みに ffmpeg を使う
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(process.argv[2] ?? resolve(root, '../sample/kana-commons'))
const SR = 16000

/** 16kHz のモノラルにして、前後の無音（-40dB）を切る */
function load(name) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', resolve(dir, name), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'])
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const loud = (i) => Math.abs(x[i]) > peak * 0.01
  let a = 0
  let b = x.length - 1
  while (a < b && !loud(a)) a++
  while (b > a && !loud(b)) b--
  // 同じ音を何度か言っている録音があるので、最初の 1 回（0.1 秒以上の無音の手前）までにする
  const quiet = SR * 0.1
  for (let i = a, run = 0; i <= b; i++) {
    run = loud(i) ? 0 : run + 1
    if (run >= quiet) {
      b = i - run
      break
    }
  }
  return x.slice(a, b + 1).map((v) => (v / peak) * 0.5)
}

const { instance } = await WebAssembly.instantiate(readFileSync(resolve(root, 'src/dsp.wasm')), { env: { report_progress: () => {} } })
const dsp = instance.exports
function segment(x, codes) {
  const input = dsp.alloc_f32(x.length)
  new Float32Array(dsp.memory.buffer, input, x.length).set(x)
  const c = dsp.alloc_f32(codes.length)
  new Float32Array(dsp.memory.buffer, c, codes.length).set(codes)
  const n = dsp.segment_morae(input, x.length, SR, c, codes.length)
  const out = new Float32Array(dsp.memory.buffer, dsp.output_ptr(), n * 3).slice()
  dsp.free_f32(input, x.length)
  dsp.free_f32(c, codes.length)
  return Array.from({ length: n }, (_, i) => ({ start: out[i * 3], end: out[i * 3 + 1], sure: out[i * 3 + 2] > 0 }))
}

const { moraCode } = await import('../src/reading.ts')
// つなぐ組み合わせ（ファイル、音）。間の無音 gap 秒
const CASES = [
  { files: [['Ja-A.oga', 'あ'], ['Ja-U.oga', 'う'], ['Ja-O.oga', 'お']], gap: 0 },
  { files: [['Ja-ka.ogg', 'か'], ['Ja-Tsu.oga', 'つ'], ['Ja-O.oga', 'お']], gap: 0 },
  { files: [['Ja-A.oga', 'あ'], ['Ja-ka.ogg', 'か'], ['Ja-Tsu.oga', 'つ'], ['Ja-U.oga', 'う']], gap: 0.03 },
]
let errors = []
for (const c of CASES) {
  if (!c.files.every(([f]) => existsSync(resolve(dir, f)))) continue
  const parts = c.files.map(([f]) => load(f))
  const gap = new Float32Array(Math.round(c.gap * SR))
  const truth = []
  let at = 0
  const chunks = []
  parts.forEach((p, i) => {
    if (i > 0) {
      chunks.push(gap)
      at += gap.length
    }
    truth.push(at / SR)
    chunks.push(p)
    at += p.length
  })
  const x = new Float32Array(at)
  let o = 0
  for (const ch of chunks) {
    x.set(ch, o)
    o += ch.length
  }
  const m = segment(x, c.files.map(([, k]) => moraCode(k)))
  const label = c.files.map(([, k]) => k).join('')
  const diffs = m.slice(1).map((v, i) => Math.abs(v.start - truth[i + 1]) * 1000)
  errors.push(...diffs)
  console.log(`${label}（無音 ${c.gap * 1000}ms）: 正解 ${truth.map((t) => t.toFixed(2)).join(' ')} / 結果 ${m.map((v) => v.start.toFixed(2) + (v.sure ? '' : '?')).join(' ')} / ずれ ${diffs.map((d) => d.toFixed(0)).join(' ')} ms`)
}
// 単語（正解は手で付けていないので、結果だけを出す）
if (existsSync(resolve(dir, 'Ja-kokoro.ogg'))) {
  const m = segment(load('Ja-kokoro.ogg'), ['こ', 'こ', 'ろ'].map(moraCode))
  console.log(`こころ: ${m.map((v) => `${v.start.toFixed(2)}-${v.end.toFixed(2)}${v.sure ? '' : '?'}`).join(' ')}`)
}
if (errors.length) console.log(`ずれの平均 ${(errors.reduce((s, v) => s + v, 0) / errors.length).toFixed(0)} ms（目安 30ms 以内）`)
