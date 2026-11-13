/** OWNER: Agent B. UI-only state (not part of the shared contract). */
import { useEffect, useState } from 'react'
import { create } from 'zustand'

export type PanelView = 'progress' | 'calendar'

interface UiState {
  aboutOpen: boolean
  setAbout: (open: boolean) => void
  /** B15 — which view the region/place panel shows */
  panelView: PanelView
  setPanelView: (v: PanelView) => void
}

export const useUi = create<UiState>((set) => ({
  aboutOpen: false,
  setAbout: (aboutOpen) => set({ aboutOpen }),
  panelView: 'progress',
  setPanelView: (panelView) => set({ panelView }),
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
