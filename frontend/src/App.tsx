/**
 * Layout only: the globe fills the screen; UI floats above it in fixed slots.
 * Agent A owns <GlobeView/>; Agent B owns everything in src/ui/ and src/charts/.
 * The overlay is pointer-events:none so the globe stays draggable — panels opt back in.
 */
import GlobeView from './globe/GlobeView'
import TopBar from './ui/TopBar'
import RegionList, { RegionChips } from './ui/RegionList'
import SpotlightPanel from './ui/SpotlightPanel'
import Timeline from './ui/Timeline'
import { usePlayback } from './ui/usePlayback'
import Tour from './ui/Tour'
import AboutModal from './ui/AboutModal'
import MobileSheet from './ui/MobileSheet'
import { useIsMobile } from './ui/uiStore'

function DesktopLayout() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
      <TopBar />
      <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
        <RegionList />
        <SpotlightPanel />
      </div>
      <Timeline />
    </div>
  )
}

function MobileLayout() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      <div className="space-y-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <TopBar compact />
        <RegionChips />
      </div>
      <MobileSheet />
    </div>
  )
}

export default function App() {
  const mobile = useIsMobile()
  usePlayback()
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <GlobeView />
      </div>
      {/* the "MOCK DATA" badge lives in the top bar (always visible) */}
      {mobile ? <MobileLayout /> : <DesktopLayout />}
      <Tour />
      <AboutModal />
    </div>
  )
}
