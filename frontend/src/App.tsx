/**
 * Layout only: the globe fills the screen; UI floats above it in fixed slots.
 * Agent A owns <GlobeView/>; Agent B owns everything in src/ui/.
 * The overlay is pointer-events:none so the globe stays draggable — panels opt back in.
 */
import GlobeView from './globe/GlobeView'
import TopBar from './ui/TopBar'
import RegionList from './ui/RegionList'
import SpotlightPanel from './ui/SpotlightPanel'
import Timeline from './ui/Timeline'
import { USING_MOCK } from './shared/api'

export default function App() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <GlobeView />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
        <TopBar />
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <RegionList />
          <SpotlightPanel />
        </div>
        <Timeline />
      </div>

      {USING_MOCK && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[10px] tracking-widest text-warn">
          MOCK DATA — NOT REAL RESULTS
        </div>
      )}
    </div>
  )
}
