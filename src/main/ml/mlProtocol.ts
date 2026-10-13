import { createReadStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { app, net, protocol } from 'electron'

/**
 * Protocolo `clawos-ml://` para a transcrição de voz local (Whisper no renderer):
 *
 * - `clawos-ml://hf/<repo>/resolve/<rev>/<arquivo>` — arquivos do modelo. Baixados do
 *   Hugging Face uma única vez e guardados em `userData/models`; depois tudo roda offline.
 * - `clawos-ml://app/<caminho>` — arquivos do próprio renderer (o .wasm do ONNX Runtime),
 *   já que `fetch` não lê `file://` no app empacotado.
 *
 * O áudio nunca sai do computador: só os pesos do modelo são baixados.
 */
export const ML_SCHEME = 'clawos-ml'

/** Só estes repositórios podem ser baixados por aqui. */
const ALLOWED_MODELS = ['onnx-community/whisper-large-v3-turbo/', 'onnx-community/whisper-small/']

/** Precisa rodar antes de `app.whenReady()`. */
export function registerMlScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ML_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

export function handleMlProtocol(rendererDir: string): void {
  protocol.handle(ML_SCHEME, (request) => {
    const url = new URL(request.url)
    return mlResponse(rendererDir, url.host, url.pathname, request.headers.get('range'))
  })
}

/**
 * Resposta para `app/<arquivo>` ou `hf/<modelo>`; usada pelo protocolo do app e pela
 * rota `/ml/...` do acesso remoto (o navegador do celular baixa o modelo por aqui).
 */
export function mlResponse(
  rendererDir: string,
  host: string,
  pathname: string,
  range: string | null,
): Promise<Response> | Response {
  const path = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (host === 'app') return serveFile(rendererDir, path)
  if (host === 'hf') return serveModel(join(app.getPath('userData'), 'models'), path, range)
  return new Response('Not found', { status: 404 })
}

/** Caminho dentro de `root`, ou null se tentar sair dele (`..`). */
export function safeJoin(root: string, path: string): string | null {
  const full = resolve(root, path)
  return full.startsWith(resolve(root) + sep) ? full : null
}

function serveFile(root: string, path: string): Response {
  const file = safeJoin(root, path)
  if (!file || !existsSync(file)) return new Response('Not found', { status: 404 })
  return fileResponse(file)
}

function fileResponse(file: string): Response {
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
  return new Response(body, {
    headers: {
      'Content-Length': String(statSync(file).size),
      'Content-Type': contentType(file),
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/** Arquivos sendo baixados agora (um download por arquivo). */
const downloading = new Set<string>()

async function serveModel(
  modelsDir: string,
  path: string,
  range: string | null,
): Promise<Response> {
  if (!ALLOWED_MODELS.some((prefix) => path.startsWith(prefix)))
    return new Response('Forbidden', { status: 403 })
  const file = safeJoin(modelsDir, path)
  if (!file) return new Response('Forbidden', { status: 403 })

  // `Range: bytes=0-0`: o transformers.js só quer saber se o arquivo existe e o tamanho.
  if (range) {
    if (existsSync(file)) {
      const size = statSync(file).size
      return new Response(new Uint8Array(1), {
        status: 206,
        headers: {
          'Content-Range': `bytes 0-0/${size}`,
          'Content-Length': '1',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
        },
      })
    }
    const probe = await net.fetch(`https://huggingface.co/${path}`, { headers: { Range: range } })
    return new Response(probe.body, {
      status: probe.status,
      headers: {
        'Content-Range': probe.headers.get('content-range') ?? '',
        'Content-Length': probe.headers.get('content-length') ?? '',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
      },
    })
  }

  if (existsSync(file)) return fileResponse(file)

  const remote = await net.fetch(`https://huggingface.co/${path}`)
  if (!remote.ok || !remote.body) {
    return new Response(remote.statusText, {
      status: remote.status,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
  const headers = new Headers({
    'Content-Type': contentType(file),
    'Access-Control-Allow-Origin': '*',
  })
  const length = remote.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  // Outro pedido já está gravando este arquivo: só repassa.
  if (downloading.has(file)) return new Response(remote.body, { headers })
  downloading.add(file)

  // Repassa ao renderer enquanto grava no disco; só vira cache quando termina inteiro.
  const [toDisk, toRenderer] = remote.body.tee()
  mkdirSync(dirname(file), { recursive: true })
  const partial = `${file}.part`
  const out = createWriteStream(partial)
  Readable.fromWeb(toDisk as import('node:stream/web').ReadableStream)
    .on('error', () => out.destroy())
    .pipe(out)
    .on('finish', () => {
      downloading.delete(file)
      try {
        // Só vira cache se veio inteiro.
        if (!length || statSync(partial).size === Number(length)) renameSync(partial, file)
        else unlinkSync(partial)
      } catch {
        // Download interrompido: tenta de novo na próxima vez.
      }
    })
    .on('error', () => {
      downloading.delete(file)
      try {
        unlinkSync(partial)
      } catch {
        // já removido
      }
    })
  return new Response(toRenderer, { headers })
}

function contentType(file: string): string {
  if (file.endsWith('.json')) return 'application/json'
  if (file.endsWith('.wasm')) return 'application/wasm'
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript'
  return 'application/octet-stream'
}
