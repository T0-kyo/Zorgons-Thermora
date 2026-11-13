/**
 * Layout: "a reading column beside a live planet".
 * Desktop: one opaque editorial column (masthead, the question, the panel, the region index)
 * and the globe full-bleed beside it. Controls are set directly on the globe as type:
 * what the fires show (top), the human/natural spectrum + the year ruler (bottom).
 * No floating glass boxes.
 */
import GlobeView from './globe/GlobeView'
import { MockBadge, TourButton, UtcClock } from './ui/TopBar'
import TopBar from './ui/TopBar'
import RegionList, { RegionChips } from './ui/RegionList'
import { PanelBody } from './ui/SpotlightPanel'
import Timeline from './ui/Timeline'
import { usePlayback } from './ui/usePlayback'
import Tour from './ui/Tour'
import AboutModal from './ui/AboutModal'
import MobileSheet from './ui/MobileSheet'
import { useIsMobile, useUi } from './ui/uiStore'
import Spectrum from './ui/Spectrum'
import ModeTabs from './ui/ModeTabs'
import { useDataStatus } from './shared/dataStatus'
import { CollapseButton, Rail, usePanelKey, usePanelState } from './ui/Rail'

function Masthead({ onCollapse }: { onCollapse: () => void }) {
  const setAbout = useUi((s) => s.setAbout)
  return (
    <header className="flex items-center justify-between gap-3">
      <span className="wordmark text-[19px]">Thermora</span>
      <div className="flex items-center gap-4 text-[13px]">
        <TourButton />
        <button onClick={() => setAbout(true)} className="text-dim hover:text-text">
          Methods
        </button>
        <CollapseButton label="Reading panel" side="left" onClose={onCollapse} shortcut="[" controls="reading-panel" />
      </div>
    </header>
  )
}

const LEFT_W = 'minmax(360px,420px)'
const RIGHT_W = '264px'
const RAIL_W = '44px'

function DesktopLayout() {
  const [left, toggleLeft] = usePanelState('left')
  const [right, toggleRight] = usePanelState('right')
  const [bottom, toggleBottom] = usePanelState('bottom')
  usePanelKey('[', toggleLeft)
  usePanelKey(']', toggleRight)
  usePanelKey('\\', toggleBottom)

  return (
    <div
      className="grid h-full transition-[grid-template-columns] duration-300 ease-[cubic-bezier(.16,1,.3,1)]"
      style={{ gridTemplateColumns: `${left ? LEFT_W : RAIL_W} minmax(0,1fr) ${right ? RIGHT_W : RAIL_W}` }}
    >
      {/* LEFT: the reading column (question, place search, the target panel) */}
      {left ? (
        <aside id="reading-panel" className="column relative z-10 flex min-h-0 flex-col overflow-y-auto px-7 pb-10 pt-6 [scrollbar-width:thin]">
          <Masthead onCollapse={toggleLeft} />
          <div className="mt-3">
            <MockBadge />
          </div>
          <div className="mt-8">
            <PanelBody />
          </div>
        </aside>
      ) : (
        <Rail label="Who lit it?" side="left" onOpen={toggleLeft} shortcut="[" controls="reading-panel" />
      )}

      <main className="relative min-w-0">
        <GlobeView />
        {/* top: what the fires show + time, set on the planet */}
        <div className="on-globe pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-8 pt-6">
          <div className="pointer-events-auto">
            <ModeTabs />
          </div>
          <div className="pointer-events-auto text-right">
            <UtcClock />
          </div>
        </div>
        {/* bottom: the signature instrument (collapsible) + the year ruler */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-5 ${bottom ? 'globe-scrim pt-16' : 'pt-6'}`}>
          <div id="instrument" className="pointer-events-auto mx-auto max-w-[920px]">
            <div className="mb-1 flex justify-end">
              <button
                onClick={toggleBottom}
                aria-expanded={bottom}
                aria-controls="instrument"
                title={`${bottom ? 'Hide' : 'Show'} the human/natural filter (\\)`}
                className="on-globe text-[13px] text-dim transition-colors hover:text-text"
              >
                {bottom ? 'Hide filter ⌄' : 'Human/natural filter ⌃'}
              </button>
            </div>
            {bottom && <Spectrum />}
            <div className="bare mt-4 [&_footer]:px-0">
              <Timeline />
            </div>
          </div>
        </div>
      </main>

      {/* RIGHT: region menu */}
      {right ? (
        <aside id="region-menu" className="column column-right relative z-10 flex min-h-0 flex-col overflow-y-auto px-5 pb-8 pt-6 [scrollbar-width:thin]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[22px]">Regions</h2>
            <CollapseButton label="Regions" side="right" onClose={toggleRight} shortcut="]" controls="region-menu" />
          </div>
          <div className="bare [&_nav]:w-full [&_nav]:p-0 [&_nav>div:first-child]:px-0 [&_nav>div:first-child>span:first-child]:invisible">
            <RegionList />
          </div>
        </aside>
      ) : (
        <Rail label="Regions" side="right" onOpen={toggleRight} shortcut="]" controls="region-menu" />
      )}
    </div>
  )
}

function MobileLayout() {
  return (
    <>
      <div className="absolute inset-0">
        <GlobeView />
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        <div className="space-y-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <TopBar compact />
          <RegionChips />
        </div>
        <div className="space-y-2">
          <div className="globe-scrim pointer-events-auto px-3 pb-1 pt-6">
            <Spectrum compact />
          </div>
          <MobileSheet />
        </div>
      </div>
    </>
  )
}

export default function App() {
  // re-render everything when the backend replaces the region list
  useDataStatus((s) => s.regionsVersion)
  const mobile = useIsMobile()
  usePlayback()
  return (
    <div className="relative h-full w-full">
      {mobile ? <MobileLayout /> : <DesktopLayout />}
      <Tour />
      <AboutModal />
    </div>
  )
}
