/**
 * OWNER: Agent B. B8 — guided tour with voiceover (full ≈60 s, or the 30-second cut).
 *
 * Timing follows the voice: each step lasts max(minMs, lead + clip length) + gap, so the narrator
 * is never cut off and never runs into the next shot. With recordings, the whole voice track is
 * scheduled on the Web Audio clock up front and the shots follow that clock, so a stuttering
 * page can't push the voice out of sync. Without recordings, the browser draft voice reads the
 * lines one by one (uiStore.draftVoice). Captions always show the same words.
 * Any click, tap, wheel or Esc stops the tour (and the voice); a globe drag stops it too.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../../shared/store'
import { regionById } from '../../shared/regions'
import { useUi } from '../uiStore'
import { TOUR_YEAR, buildScript, captionOf } from './script'
import { GAP_MS, LEAD_MS, planSteps, type Step } from './timing'
import { audioNow, ensureAudio, loadClips, scheduleClip, speakDraft, stopVoice, type Clip } from './voice'

interface Cap {
  i: number
  n: number
  text: string
  ms: number
  regionId: string | null
}

const app = () => useApp.getState()
const ui = () => useUi.getState()

export default function Tour() {
  const touring = useApp((s) => s.touring)
  const muted = useUi((s) => s.muted)
  const setMuted = useUi((s) => s.setMuted)
  const [cap, setCap] = useState<Cap | null>(null)

  // ---- run the script --------------------------------------------------------------
  useEffect(() => {
    if (!touring) return
    let stopped = false
    let wake = () => {}
    const aborted = new Promise<void>((r) => (wake = r))
    const wait = <T,>(p: Promise<T>) => Promise.race([p, aborted])
    const sleep = (ms: number) => wait(new Promise<void>((r) => setTimeout(r, ms)))
    const variant = ui().tourVariant

    const show = (i: number, n: number, st: Step) => {
      const L = st.line
      app().setCameraTarget(L.shot.camera ?? null)
      app().selectRegion(L.shot.regionId)
      app().setMode(L.shot.mode)
      if (st.clip === null && clipsKnown.get(L.id)) {
        console.warn(`[tour] clip ${L.id}.mp3 was recorded for different words; open #voiceover to re-record`)
      }
      setCap({ i, n, text: captionOf(L.text), ms: st.ms, regionId: L.shot.regionId })
    }
    let clipsKnown = new Map<string, Clip>()

    ;(async () => {
      app().setPlaying(false)
      app().setYear(TOUR_YEAR)
      const res = await wait(Promise.all([buildScript(variant), loadClips(), ensureAudio()]))
      if (stopped || !res) return
      const [lines, clips, sound] = res
      clipsKnown = clips
      const steps = planSteps(lines, clips, variant)
      const draftMode = ui().draftVoice
      const useDraft = draftMode === 'on' || (draftMode === 'auto' && clips.size === 0)

      if (useDraft) {
        // rehearsal: the browser voice can't be scheduled, so go line by line
        for (let i = 0; i < steps.length && !stopped; i++) {
          const st = steps[i]
          show(i, steps.length, st)
          const t0 = performance.now()
          await sleep(LEAD_MS[variant])
          if (stopped) return
          if (st.clip && sound) scheduleClip(st.clip)
          else if (!ui().muted) await wait(speakDraft(st.line.text))
          if (stopped) return
          await sleep(Math.max(GAP_MS[variant], st.ms - (performance.now() - t0)))
        }
      } else {
        // recorded: the whole voice track is scheduled on the audio clock; visuals follow it
        const clock = sound ? audioNow : () => performance.now() / 1000
        const until = async (t: number) => {
          for (let left = t - clock(); left > 0 && !stopped; left = t - clock()) await sleep(Math.min(left * 1000, 120))
        }
        const starts: number[] = []
        let at = clock() + 0.15
        for (const st of steps) {
          starts.push(at)
          if (sound && st.clip) scheduleClip(st.clip, at + LEAD_MS[variant] / 1000)
          at += st.ms / 1000
        }
        for (let i = 0; i < steps.length && !stopped; i++) {
          await until(starts[i])
          if (stopped) return
          show(i, steps.length, steps[i])
        }
        await until(at)
      }
      if (!stopped) {
        app().setCameraTarget(null)
        app().stopTour()
      }
    })()

    return () => {
      stopped = true
      wake()
      stopVoice()
      setCap(null)
    }
  }, [touring])

  // ---- any interaction stops it (tour controls excepted) ------------------------------
  useEffect(() => {
    if (!touring) return
    const stop = (e?: Event) => {
      if (e?.target instanceof Element && e.target.closest('[data-tour-control]')) return
      app().stopTour()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop()
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', stop, true)
      window.addEventListener('wheel', stop, { capture: true, passive: true })
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', stop, true)
      window.removeEventListener('wheel', stop, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [touring])

  const where = regionById(cap?.regionId ?? null)?.name ?? 'Global view'

  return (
    <AnimatePresence>
      {touring && cap && (
        <motion.div
          key={cap.i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-none absolute inset-x-3 top-[34%] z-20 mx-auto max-w-xl md:top-auto md:bottom-28"
        >
          <div className="panel px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="label">{where}</span>
              <div className="flex items-center gap-3">
                <span className="label">
                  {cap.i + 1} of {cap.n}
                </span>
                <button
                  data-tour-control
                  onClick={() => setMuted(!muted)}
                  aria-label={muted ? 'Unmute voiceover' : 'Mute voiceover'}
                  aria-pressed={muted}
                  className="pointer-events-auto rounded border border-line px-2 py-0.5 text-xs text-dim hover:text-text"
                >
                  {muted ? 'Sound off' : 'Sound on'}
                </button>
              </div>
            </div>
            <p className="text-center text-[15px] leading-relaxed md:text-base">{cap.text}</p>
            <div className="mt-2 h-0.5 overflow-hidden rounded bg-line">
              <motion.div
                key={cap.i}
                className="h-full bg-cyan"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: cap.ms / 1000, ease: 'linear' }}
              />
            </div>
            {cap.i === 0 && <div className="label mt-1.5 text-center">Click anywhere to leave the tour</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
