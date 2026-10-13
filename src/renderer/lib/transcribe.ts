import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import ortWasmMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

/**
 * Transcrição de voz 100% local com Whisper (transformers.js + ONNX Runtime Web).
 *
 * O modelo é baixado uma vez do Hugging Face pelo protocolo `clawos-ml://` (que grava em
 * `userData/models`) e roda na GPU via WebGPU; sem WebGPU com fp16, usa um modelo menor
 * na CPU (WASM). O áudio não sai do computador.
 */

export interface ModelChoice {
  id: string
  device: 'webgpu' | 'wasm'
  dtype: Record<string, string>
  /** Tamanho aproximado do download, para avisar o usuário. */
  sizeMb: number
}

const TURBO: ModelChoice = {
  id: 'onnx-community/whisper-large-v3-turbo',
  device: 'webgpu',
  dtype: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
  sizeMb: 565,
}
const SMALL_GPU: ModelChoice = {
  id: 'onnx-community/whisper-small',
  device: 'webgpu',
  dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  sizeMb: 590,
}
const SMALL_CPU: ModelChoice = {
  id: 'onnx-community/whisper-small',
  device: 'wasm',
  dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
  sizeMb: 250,
}

/** Melhor modelo que esta máquina roda bem. */
export async function pickModel(): Promise<ModelChoice> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapter | null> } })
    .gpu
  const adapter = await gpu?.requestAdapter().catch(() => null)
  if (!adapter) return SMALL_CPU
  return adapter.features.has('shader-f16') ? TURBO : SMALL_GPU
}

interface GpuAdapter {
  features: { has(feature: string): boolean }
}

/** No app empacotado o renderer roda em file://, onde `fetch` não lê arquivos locais. */
function servable(url: string): string {
  const absolute = new URL(url, location.href)
  if (absolute.protocol !== 'file:') return absolute.href
  const root = new URL('.', location.href).pathname
  return `clawos-ml://app/${absolute.pathname.slice(root.length)}`
}

export interface LoadProgress {
  /** 0–100, somando todos os arquivos do modelo. */
  percent: number
  /** true quando os arquivos vêm do disco (sem download). */
  cached: boolean
}

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null

export function loadTranscriber(
  onProgress?: (progress: LoadProgress) => void,
): Promise<AutomaticSpeechRecognitionPipeline> {
  loading ??= (async () => {
    const { env, pipeline } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    // Downloads passam pelo processo principal, que guarda os arquivos em disco.
    const fetchViaApp = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      // No navegador (acesso remoto), o mesmo cache passa pela rota /ml/ do computador.
      const base = window.__clawosRemote ? `${location.origin}/ml/hf/` : 'clawos-ml://hf/'
      return fetch(url.replace(/^https:\/\/huggingface\.co\//, base), init)
    }
    env.fetch = fetchViaApp as typeof env.fetch
    env.useBrowserCache = false
    env.useWasmCache = false
    const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } }
    if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: servable(ortWasmMjs), wasm: servable(ortWasm) }

    const model = await pickModel()
    const files = new Map<string, { loaded: number; total: number }>()
    let downloaded = false
    const transcriber = await pipeline('automatic-speech-recognition', model.id, {
      device: model.device,
      dtype: model.dtype as never,
      progress_callback: (event: {
        status: string
        file?: string
        loaded?: number
        total?: number
      }) => {
        if (event.status !== 'progress' || !event.file) return
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        if (total > 5_000_000) downloaded = true
        onProgress?.({
          percent: total ? Math.round((loaded / total) * 100) : 0,
          cached: !downloaded,
        })
      },
    })
    return transcriber as AutomaticSpeechRecognitionPipeline
  })()
  loading.catch(() => {
    loading = null
  })
  return loading
}

/** Converte o áudio gravado para PCM mono 16 kHz, o formato que o Whisper espera. */
export async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: 16000 })
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
    const mono = new Float32Array(buffer.length)
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < data.length; i++) mono[i]! += data[i]! / buffer.numberOfChannels
    }
    return mono
  } finally {
    void context.close()
  }
}

export async function transcribe(audio: Float32Array, language = 'portuguese'): Promise<string> {
  const transcriber = await loadTranscriber()
  const output = await transcriber(audio, {
    language,
    task: 'transcribe',
    // Áudios longos são fatiados em janelas de 30 s.
    chunk_length_s: 30,
    stride_length_s: 5,
  })
  const text = Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text
  return text.trim()
}
