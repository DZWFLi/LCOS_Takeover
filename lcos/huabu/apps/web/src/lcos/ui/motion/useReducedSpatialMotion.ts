// Direct donor: GEN1 features/spatial/visual/useReducedSpatialMotion.ts; no product state.
import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
let media: MediaQueryList | null = null
const listeners = new Set<() => void>()

function getMedia(): MediaQueryList | null {
  if (media || typeof window === 'undefined' || !window.matchMedia) return media
  media = window.matchMedia(QUERY)
  return media
}

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  const current = getMedia()
  listeners.add(listener)
  if (listeners.size === 1) current?.addEventListener?.('change', notify)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) current?.removeEventListener?.('change', notify)
  }
}

const snapshot = () => getMedia()?.matches === true
const serverSnapshot = () => false

/** Read the shared media-query snapshot outside React event handlers. */
export function prefersReducedSpatialMotion(): boolean {
  return snapshot()
}

/** Shared singleton reduced-motion store for every Spatial Surface primitive/component. */
export function useReducedSpatialMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
