import type { ClawosApi } from '../shared/ipc'

declare global {
  interface Window {
    clawos: ClawosApi
  }
}
