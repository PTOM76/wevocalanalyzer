// 解析の Worker。計算は dsp.wasm（dsp/ の Rust、wevocal-lib の FFT を使う）で行う
import type { SpecRequest, WorkerMessage } from './types'

/** Rust 側 `spec::ROWS` と一致させる */
const SPEC_ROWS = 128

interface DspExports {
  memory: WebAssembly.Memory
  alloc_f32(len: number): number
  free_f32(ptr: number, len: number): void
  analyze_spectrogram(input: number, frames: number, sampleRate: number): number
  output_u8_ptr(): number
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

function spectrogram(dsp: DspExports, req: SpecRequest): Uint8Array {
  const n = req.samples.length
  const input = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, input, n).set(req.samples)
    const frames = dsp.analyze_spectrogram(input, n, req.sampleRate)
    // wasm の呼び出しの中でメモリが増えうるので、view は呼び出しのあとで作る
    return new Uint8Array(dsp.memory.buffer, dsp.output_u8_ptr(), frames * SPEC_ROWS).slice()
  } finally {
    dsp.free_f32(input, n)
  }
}

self.onmessage = async (e: MessageEvent<SpecRequest>) => {
  const req = e.data
  current = req.id
  try {
    const data = spectrogram(await dspReady, req)
    post({ id: req.id, data }, [data.buffer])
  } catch (err) {
    post({ id: req.id, error: err instanceof Error ? err.message : String(err) })
  }
}
