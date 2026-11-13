/** OWNER: Agent B. UI-only state (not part of the shared contract). */
import { useEffect, useState } from 'react'
import { create } from 'zustand'

interface UiState {
  aboutOpen: boolean
  setAbout: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  aboutOpen: false,
  setAbout: (aboutOpen) => set({ aboutOpen }),
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
