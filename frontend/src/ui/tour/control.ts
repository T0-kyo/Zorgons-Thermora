/** OWNER: Agent B. Start/stop the guided tour. Call startGuidedTour from a click handler. */
import { useApp } from '../../shared/store'
import { useUi } from '../uiStore'
import type { TourVariant } from './script'
import { primeVoice, stopVoice } from './voice'

export function startGuidedTour(variant: TourVariant = 'full') {
  primeVoice() // must run inside the click so the browser allows sound
  useUi.getState().setTourVariant(variant)
  useApp.getState().startTour()
}

export function stopGuidedTour() {
  stopVoice()
  useApp.getState().stopTour()
}
