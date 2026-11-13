/** OWNER: Agent B. UI-only state (not part of the shared contract). */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { TourVariant } from './tour/script'
import { setPlayerMuted } from './tour/voice'

/**
 * Draft (browser) voice:
 * auto = only while no recorded clips exist (never mixes a robot voice with the narrator),
 * on = for every line without a valid clip, off = never.
 */
export type DraftVoice = 'auto' | 'on' | 'off'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

interface UiState {
  aboutOpen: boolean
  setAbout: (open: boolean) => void
  scriptOpen: boolean
  setScriptOpen: (open: boolean) => void
  tourVariant: TourVariant
  setTourVariant: (v: TourVariant) => void
  muted: boolean
  setMuted: (m: boolean) => void
  draftVoice: DraftVoice
  setDraftVoice: (d: DraftVoice) => void
}

export const useUi = create<UiState>((set) => ({
  aboutOpen: false,
  setAbout: (aboutOpen) => set({ aboutOpen }),
  scriptOpen: false,
  setScriptOpen: (scriptOpen) => set({ scriptOpen }),
  tourVariant: 'full',
  setTourVariant: (tourVariant) => set({ tourVariant }),
  muted: read('thermora.muted') === '1',
  setMuted: (muted) => {
    write('thermora.muted', muted ? '1' : '0')
    setPlayerMuted(muted)
    set({ muted })
  },
  draftVoice: (read('thermora.draftVoice') as DraftVoice | null) ?? 'auto',
  setDraftVoice: (draftVoice) => {
    write('thermora.draftVoice', draftVoice)
    set({ draftVoice })
  },
}))

const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}
