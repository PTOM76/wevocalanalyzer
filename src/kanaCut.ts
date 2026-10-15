// 歌から一音（あ、い、う…）ずつ切り出す。文字化と読みは追加機能「歌詞の文字化」、境目は追加機能「解析」が行う。WeVocalSynth と WeVocal Studio で共通（追加機能の読み込みはアプリが渡す）
import type * as Analyzer from './index'
import type * as Lyrics from './lyrics'
import type { LyricsModel, LyricsSegment } from './lyricsTypes'
import { createZip } from 'pevenmui/web'
import { encodeWav, type Clip } from 'wevocal-lib'

export type { LyricsSegment, LyricsModel } from './lyricsTypes'

/** 一音（秒。音声の先頭から） */
export interface MoraMark {
  start: number
  end: number
  /** 読み（ひらがな） */
  mora: string
  /** 境目がはっきりしているか */
  sure: boolean
  /** 中身が読みと合うか（偽なら、ほかの母音に近いか、いくつかの音が入っている。前の版の結果にはない） */
  vowelOk?: boolean
}

/** 書き出すときの前後の余白（秒） */
const PAD_SEC = 0.02
/** 書き出すときの端のフェード（秒） */
const FADE_SEC = 0.005

/** `clip` の `start`〜`end` 秒 */
function slice(clip: Clip, start: number, end: number): Clip {
  const a = Math.max(0, Math.floor(start * clip.sampleRate))
  const b = Math.min(clip.channels[0]?.length ?? 0, Math.ceil(end * clip.sampleRate))
  return { sampleRate: clip.sampleRate, channels: clip.channels.map((c) => c.slice(a, Math.max(a, b))) }
}

export interface TranscribeOptions {
  model: LyricsModel
  device: 'webgpu' | 'wasm'
  /** CPU で使うスレッドの数（0 は自動） */
  threads?: number
  onDownload?: (p: number) => void
  onTranscribe?: () => void
  signal?: AbortSignal
}

/** アプリの追加機能の読み込み方で、文字化と境目の手順を作る */
export function createKanaHost(loadAddon: <T>(id: string) => Promise<T>) {
  return {
    /** `clip` の `start`〜`end` 秒を日本語として文字化し、読みを付ける。区間の時刻は音声の先頭から */
    async transcribeRange(clip: Clip, start: number, end: number, o: TranscribeOptions): Promise<LyricsSegment[]> {
      const lyrics = await loadAddon<typeof Lyrics>('analyzer-lyrics')
      const segments = await lyrics.transcribeLyrics(slice(clip, start, end), { ...o, language: 'japanese' })
      return segments.map((s) => ({ ...s, start: s.start + start, end: s.end + start }))
    },
    /** 区間ごとの読みを一音ずつに分け、境目を求める（追加機能「解析」の findMoraeInLyrics）。`onProgress` は 0〜1 */
    async findMorae(clip: Clip, segments: LyricsSegment[], onProgress?: (p: number) => void, signal?: AbortSignal): Promise<MoraMark[]> {
      const analyzer = await loadAddon<typeof Analyzer>('analyzer')
      return analyzer.findMoraeInLyrics(clip, segments, { onProgress, signal })
    },
  }
}

/** ほぼ無音とみなす強さ（RMS。-50dBFS） */
const SILENT_RMS = 10 ** (-50 / 20)
/** 一音ずつの強さの中央値より、これだけ小さい音も無音とみなす（dB。録音ごとの音量の違いによらないよう、曲の中で比べる） */
const SILENT_BELOW_DB = 20

/** `m` の範囲の強さ（全チャンネルの RMS） */
function rmsOf(clip: Clip, m: MoraMark): number {
  const a = Math.max(0, Math.floor(m.start * clip.sampleRate))
  const b = Math.min(clip.channels[0]?.length ?? 0, Math.ceil(m.end * clip.sampleRate))
  let sum = 0
  for (const ch of clip.channels) for (let i = a; i < b; i++) sum += ch[i] * ch[i]
  const n = (b - a) * clip.channels.length
  return n > 0 ? Math.sqrt(sum / n) : 0
}

/** 無音の音（境目がずれて、声のない所に入ったものなど）を除く。書き出しの前に使う */
export function audibleMorae(clip: Clip, morae: MoraMark[]): MoraMark[] {
  const rms = morae.map((m) => rmsOf(clip, m))
  const sorted = [...rms].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const limit = Math.max(SILENT_RMS, median * 10 ** (-SILENT_BELOW_DB / 20))
  return morae.filter((_, i) => rms[i] >= limit)
}

/** 使い物にならないとみなす短さ（秒） */
const MIN_USABLE_SEC = 0.1

/** 書き出す音。無音を除き、`keepAll` でなければ短すぎるものと中身が読みと合わないものも除く */
export function usableMorae(clip: Clip, morae: MoraMark[], keepAll = false): MoraMark[] {
  const audible = audibleMorae(clip, morae)
  return keepAll ? audible : audible.filter((m) => m.end - m.start >= MIN_USABLE_SEC && m.vowelOk !== false)
}

/** 一音を切り出す（前後に余白を付け、端をフェードする） */
export function sliceMora(clip: Clip, m: MoraMark): Clip {
  const c = slice(clip, m.start - PAD_SEC, m.end + PAD_SEC)
  const fade = Math.min(Math.round(FADE_SEC * clip.sampleRate), Math.floor((c.channels[0]?.length ?? 0) / 2))
  for (const ch of c.channels) {
    for (let i = 0; i < fade; i++) {
      const g = i / fade
      ch[i] *= g
      ch[ch.length - 1 - i] *= g
    }
  }
  return c
}

/** 一音ずつの WAV をまとめた ZIP。同じ音が何度も出たら あ.wav、あ_2.wav… とする。使えない音は入れない（usableMorae） */
export async function exportMorae(clip: Clip, morae: MoraMark[], keepAll = false): Promise<Blob> {
  const count = new Map<string, number>()
  const entries = usableMorae(clip, morae, keepAll).map((m) => {
    const n = (count.get(m.mora) ?? 0) + 1
    count.set(m.mora, n)
    return { name: n === 1 ? `${m.mora}.wav` : `${m.mora}_${n}.wav`, data: encodeWav(sliceMora(clip, m)) }
  })
  return createZip(entries)
}
