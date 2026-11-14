/** OWNER: Agent B. B11 — About / Methods: sources, method summary, team, AI-use disclosure. */
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUi } from './uiStore'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <div className="label mb-1.5 text-cyan">{title}</div>
      <div className="space-y-1.5 text-sm leading-relaxed text-text/85">{children}</div>
    </section>
  )
}

export default function AboutModal() {
  const open = useUi((s) => s.aboutOpen)
  const setAbout = useUi((s) => s.setAbout)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbout(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setAbout])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-30 grid place-items-center bg-ink/70 p-3 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setAbout(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            className="panel max-h-[88vh] w-full max-w-2xl space-y-3 overflow-y-auto p-5"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="label">About and methods</div>
                <h2 id="about-title" className="mt-1 text-xl font-semibold">
                  Thermora: the corrected fire record
                </h2>
              </div>
              <button onClick={() => setAbout(false)} aria-label="Close" className="rounded px-2 text-dim hover:bg-white/5 hover:text-text">
                ✕
              </button>
            </div>

            <p className="text-sm leading-relaxed text-text/85">
              How much have we underestimated global fire activity, and the human fingerprint behind it, by treating MODIS and VIIRS as if
              they tell the same story? Which regions are most affected?
            </p>


            <Block title="Data">
              <p>
                <b className="text-fire">MODIS</b> active fires (Terra &amp; Aqua, 1 km, 2000–present): the long historical record.
              </p>
              <p>
                <b className="text-cyan">VIIRS</b> active fires (375 m, Suomi-NPP from 2012, plus NOAA-20/21): finer resolution, so it detects
                many small fires MODIS misses.
              </p>
              <p>
                Both from{' '}
                <a className="text-cyan underline decoration-cyan/40 hover:decoration-cyan" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
                  NASA FIRMS
                </a>{' '}
                (Fire Information for Resource Management System).
              </p>
            </Block>

            <Block title="Method">
              <p>
                <b>1. One record per fire.</b> The engineering team matches MODIS and VIIRS detections into fire events. For each fire we keep
                the MODIS detections (the legacy record) and all detections from both sensors (the harmonized record).
              </p>
              <p>
                <b>2. Measure the gap.</b> The undercount is the % more fires in the harmonized record than in the legacy one, for the chosen
                country and year.
              </p>
              <p>
                <b>3. Human or natural.</b> The science team gives each fire a 0–1 score for its association with human activity. We show the
                average for each area, never a verdict on a single fire. Areas with no scored fires are shown in grey as "no score".
              </p>
            </Block>

            <Block title="Reading the map">
              <ul className="space-y-1">
                <li>
                  <span className="text-fire">Legacy (MODIS)</span>: the original record, in orange.
                </li>
                <li>
                  <span className="text-cyan">Harmonized</span>: the corrected record, MODIS plus VIIRS.
                </li>
                <li>
                  <span className="text-missed">Human vs natural</span>: each area coloured from ice blue (likely natural) to magenta (likely
                  human-driven).
                </li>
              </ul>
            </Block>

            <Block title="Team & credits">
              <p>Team Zorgons, NASA Space Apps Challenge, Cairo 2026.</p>
              <p className="text-xs text-dim">
                Earth imagery: NASA Blue Marble &amp; Black Marble. Country outlines: Natural Earth. Built with React, three.js and
                react-globe.gl.
              </p>
            </Block>

            <Block title="Use of AI">
              <p className="text-xs text-dim">
                Parts of this app were built with AI assistance (Claude, by Anthropic), directed and reviewed by the team. The data processing
                and scientific analysis are the team’s own.
              </p>
            </Block>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
