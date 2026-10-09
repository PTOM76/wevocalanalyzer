// ラウドネスの Worker（チャンネルを分けたまま計算するため、解析の Worker とは別にする）
import { analyzeLoudness } from './loudness'

self.onmessage = (e: MessageEvent<{ sampleRate: number; channels: Float32Array[] }>) => {
  ;(self as unknown as Worker).postMessage(analyzeLoudness(e.data))
}
