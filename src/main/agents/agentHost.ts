/**
 * Ponto de entrada dos adaptadores ACP embutidos.
 *
 * O main inicia este arquivo com o próprio binário do Electron em modo Node
 * (`ELECTRON_RUN_AS_NODE=1`), então o usuário não precisa ter Node instalado.
 * Antes de carregar o adaptador, removemos a variável para que ela não vaze para o
 * CLI do agente nem para os comandos que ele executar.
 *
 * Uso: `<electron> agentHost.js <caminho-absoluto-do-adaptador>`
 */
import { pathToFileURL } from 'node:url'

const adapterPath = process.argv[2]
if (!adapterPath) {
  process.stderr.write('agentHost: caminho do adaptador não informado\n')
  process.exit(2)
}

delete process.env['ELECTRON_RUN_AS_NODE']
// O adaptador lê process.argv como se fosse o próprio binário.
process.argv.splice(1, 2, adapterPath)

void import(pathToFileURL(adapterPath).href)
