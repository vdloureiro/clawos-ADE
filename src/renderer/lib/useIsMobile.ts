import { useSyncExternalStore } from 'react'

/** Tela de celular (ou tablet em pé): uma coluna, barra lateral como menu. */
const QUERY = '(max-width: 767px)'

export const isMobileNow = (): boolean => window.matchMedia(QUERY).matches

export function useIsMobile(): boolean {
  return useSyncExternalStore((notify) => {
    const media = window.matchMedia(QUERY)
    media.addEventListener('change', notify)
    return () => media.removeEventListener('change', notify)
  }, isMobileNow)
}
