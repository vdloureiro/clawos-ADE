import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { decodeAudio, loadTranscriber, transcribe, type LoadProgress } from '@/lib/transcribe'

type State =
  { kind: 'idle' } | { kind: 'recording' } | { kind: 'transcribing'; progress: LoadProgress | null }

/** Idioma do Whisper a partir do idioma do sistema; sem correspondência, ele detecta. */
function whisperLanguage(): string | undefined {
  const map: Record<string, string> = {
    pt: 'portuguese',
    en: 'english',
    es: 'spanish',
    fr: 'french',
    de: 'german',
    it: 'italian',
  }
  return map[navigator.language.slice(0, 2).toLowerCase()]
}

/**
 * Grava pelo microfone e transcreve localmente (Whisper). O texto vai para o campo de
 * mensagem, para o usuário revisar antes de enviar.
 */
export function VoiceButton({
  disabled,
  onText,
  onError,
}: {
  disabled?: boolean
  onText: (text: string) => void
  onError: (message: string) => void
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const progress = useRef<LoadProgress | null>(null)

  useEffect(() => {
    if (state.kind !== 'recording') return
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [state.kind])

  // Para a gravação se o componente sair da tela.
  useEffect(() => () => recorder.current?.stop(), [])

  const start = async () => {
    try {
      if (!(await window.clawos.invoke('media:microphone'))) {
        onError(
          'Sem acesso ao microfone. Libere o Clawos em Ajustes do Sistema › Privacidade e Segurança › Microfone.',
        )
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const media = new MediaRecorder(stream)
      media.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      media.onstop = () => {
        for (const track of stream.getTracks()) track.stop()
        recorder.current = null
        void finish(new Blob(chunks, { type: media.mimeType }))
      }
      media.start()
      recorder.current = media
      setSeconds(0)
      setState({ kind: 'recording' })
      // Carrega o modelo enquanto a pessoa fala.
      void loadTranscriber((p) => {
        progress.current = p
        setState((s) => (s.kind === 'transcribing' ? { ...s, progress: p } : s))
      }).catch(() => {})
    } catch (error) {
      onError(`Não foi possível usar o microfone: ${(error as Error).message}`)
      setState({ kind: 'idle' })
    }
  }

  const finish = async (blob: Blob) => {
    setState({ kind: 'transcribing', progress: progress.current })
    try {
      const audio = await decodeAudio(blob)
      if (audio.length < 16000 * 0.3) return // menos de 0,3 s: clique acidental
      const text = await transcribe(audio, whisperLanguage())
      if (text) onText(text)
    } catch (error) {
      onError(`Falha na transcrição: ${(error as Error).message}`)
    } finally {
      setState({ kind: 'idle' })
    }
  }

  if (state.kind === 'recording') {
    return (
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/25"
        title="Parar e transcrever"
        onClick={() => recorder.current?.stop()}
      >
        <span className="size-2 animate-pulse rounded-full bg-red-500" />
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        <Square className="size-3 fill-current" />
      </button>
    )
  }

  if (state.kind === 'transcribing') {
    const p = state.progress
    const downloading = p && !p.cached && p.percent < 100
    return (
      <span
        className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
        title={downloading ? 'O modelo de voz é baixado só na primeira vez' : undefined}
      >
        <Loader2 className="size-3.5 animate-spin" />
        {downloading ? `Baixando modelo de voz… ${p.percent}%` : 'Transcrevendo…'}
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40',
      )}
      title="Ditar mensagem (transcrição local)"
      onClick={() => void start()}
    >
      <Mic className="size-4" />
    </button>
  )
}
