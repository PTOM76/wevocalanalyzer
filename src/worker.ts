// 解析の Worker。計算は dsp.wasm（dsp/ の Rust、wevocal-lib の FFT を使う）で行う
import type { AnalyzeRequest, WorkerMessage } from './types'

/** Rust 側 `spec::ROWS` と一致させる */
const SPEC_ROWS = 128

interface DspExports {
  memory: WebAssembly.Memory
  alloc_f32(len: number): number
  free_f32(ptr: number, len: number): void
  analyze_spectrogram(input: number, frames: number, sampleRate: number): number
  analyze_f0(input: number, frames: number, sampleRate: number): number
  analyze_formants(input: number, frames: number, sampleRate: number): number
  output_u8_ptr(): number
  output_ptr(): number
}

let current = 0
const post = (m: WorkerMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)

const dspReady = (async () => {
  const res = await fetch(new URL('./dsp.wasm', import.meta.url))
  // 進み具合は Rust から env.report_progress で受け取る（呼ばれるのは計算中だけなので、今の要求に返す）
  const env = { report_progress: (p: number) => post({ id: current, progress: p }) }
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), { env })
  return instance.exports as unknown as DspExports
})()

/** 要求の種類の解析をする。スペクトログラムは u8（フレームごとに SPEC_ROWS バイト）、F0 とフォルマントは f32 */
function analyze(dsp: DspExports, req: AnalyzeRequest): Uint8Array | Float32Array {
  const n = req.samples.length
  const input = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, input, n).set(req.samples)
    // wasm の呼び出しの中でメモリが増えうるので、view は呼び出しのあとで作る
    if (req.kind === 'spec') {
      const frames = dsp.analyze_spectrogram(input, n, req.sampleRate)
      return new Uint8Array(dsp.memory.buffer, dsp.output_u8_ptr(), frames * SPEC_ROWS).slice()
    }
    const count = req.kind === 'f0' ? dsp.analyze_f0(input, n, req.sampleRate) : dsp.analyze_formants(input, n, req.sampleRate)
    return new Float32Array(dsp.memory.buffer, dsp.output_ptr(), count).slice()
  } finally {
    dsp.free_f32(input, n)
  }
}

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  const req = e.data
  try {
    const dsp = await dspReady
    // 進み具合はこの要求に返す（wasm の読み込みを待つ間に次の要求が来ても取り違えないよう、計算の直前に覚える）
    current = req.id
    const data = analyze(dsp, req)
    post({ id: req.id, data }, [data.buffer])
  } catch (err) {
    post({ id: req.id, error: err instanceof Error ? err.message : String(err) })
  }
}
