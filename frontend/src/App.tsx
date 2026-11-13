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

function Masthead() {
  const setAbout = useUi((s) => s.setAbout)
  return (
    <header className="flex items-center justify-between gap-3">
      <span className="wordmark text-[19px]">Thermora</span>
      <div className="flex items-center gap-4 text-[13px]">
        <TourButton />
        <button onClick={() => setAbout(true)} className="text-dim hover:text-text">
          Methods
        </button>
      </div>
    </header>
  )
}

function DesktopLayout() {
  return (
    <div className="grid h-full grid-cols-[minmax(380px,440px)_1fr]">
      <aside className="column relative z-10 flex min-h-0 flex-col overflow-y-auto px-7 pb-10 pt-6 [scrollbar-width:thin]">
        <Masthead />
        <div className="mt-3">
          <MockBadge />
        </div>
        <div className="mt-8">
          <PanelBody />
        </div>
        <div className="rule mt-8 pt-5">
          <div className="bare [&_nav]:w-full [&_nav]:p-0">
            <RegionList />
          </div>
        </div>
      </aside>

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
        {/* bottom: the signature instrument + the year ruler */}
        <div className="globe-scrim pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-5 pt-16">
          <div className="pointer-events-auto mx-auto max-w-[920px]">
            <Spectrum />
            <div className="bare mt-4 [&_footer]:px-0">
              <Timeline />
            </div>
          </div>
        </div>
      </main>
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
