/**
 * OWNER: Agent B. Voiceover script sheet for the people recording the tour.
 * Open with #voiceover in the URL or Shift+V. Shows the exact words to record (built from the
 * current data), the file name for each clip, timing, and whether each clip is recorded,
 * missing, or outdated (recorded for different words, e.g. before the real data landed).
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { USING_MOCK } from '../../shared/api'
import { useUi, type DraftVoice } from '../uiStore'
import { TOUR_YEAR, buildScript, readingMs, sameWords, shotLabel, wordCount, type Line, type TourVariant } from './script'
import { planSteps } from './timing'
import { PRONUNCIATION, loadClips, primeVoice, scheduleClip, speakDraft, stopVoice, type Clip } from './voice'

const HASH = '#voiceover'

type Status = 'recorded' | 'outdated' | 'missing'
const statusOf = (l: Line, clips: Map<string, Clip>): Status => {
  const c = clips.get(l.id)
  return !c ? 'missing' : sameWords(c.text, l.text) ? 'recorded' : 'outdated'
}
const STATUS_UI: Record<Status, { text: string; cls: string }> = {
  recorded: { text: 'Recorded', cls: 'border-ok/40 text-ok' },
  outdated: { text: 'Re-record', cls: 'border-warn/50 text-warn' },
  missing: { text: 'Not recorded', cls: 'border-line text-dim' },
}

function scriptText(v: TourVariant, lines: Line[]) {
  const head = [
    `Thermora guided tour, voiceover script (${v === 'full' ? 'full version' : '30-second cut'})`,
    `Data year ${TOUR_YEAR}${USING_MOCK ? '. SAMPLE DATA: numbers will change when the real data is connected, re-copy before recording.' : '.'}`,
    `Say: ${PRONUNCIATION.map((p) => p[2]).join(', ')}.`,
    '',
  ]
  return head.concat(lines.flatMap((l) => [`${l.id}.mp3  (${shotLabel(l.shot)}, ${wordCount(l.text)} words)`, l.text, ''])).join('\n')
}

function useHashOpen() {
  const open = useUi((s) => s.scriptOpen)
  const setOpen = useUi((s) => s.setScriptOpen)
  useEffect(() => {
    const sync = () => location.hash === HASH && setOpen(true)
    sync()
    window.addEventListener('hashchange', sync)
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)
      if (e.shiftKey && (e.key === 'V' || e.key === 'v') && !typing) setOpen(!useUi.getState().scriptOpen)
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('keydown', onKey)
    }
  }, [setOpen])
  const close = () => {
    stopVoice()
    setOpen(false)
    if (location.hash === HASH) location.hash = ''
  }
  return { open, close }
}

function CopyButton({ label, get }: { label: string; get: () => string }) {
  const [done, setDone] = useState<'' | 'ok' | 'fail'>('')
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(get())
          setDone('ok')
        } catch {
          setDone('fail')
        }
        setTimeout(() => setDone(''), 1800)
      }}
      className="rounded border border-cyan/40 px-3 py-1.5 text-[13px] text-cyan hover:bg-cyan/10"
    >
      {done === 'ok' ? 'Copied' : done === 'fail' ? 'Copy blocked, select the text instead' : label}
    </button>
  )
}

export default function ScriptPanel() {
  const { open, close } = useHashOpen()
  const draftVoice = useUi((s) => s.draftVoice)
  const setDraftVoice = useUi((s) => s.setDraftVoice)
  const [variant, setVariant] = useState<TourVariant>('full')
  const [data, setData] = useState<{ full: Line[]; short: Line[]; clips: Map<string, Clip> } | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    Promise.all([buildScript('full'), buildScript('short'), loadClips()])
      .then(([full, short, clips]) => live && setData({ full, short, clips }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [open])

  const lines = data?.[variant] ?? []
  const clips = data?.clips ?? new Map<string, Clip>()
  const totalS = planSteps(lines, clips, variant).reduce((s, st) => s + st.ms, 0) / 1000
  const words = lines.reduce((s, l) => s + wordCount(l.text), 0)
  const recorded = lines.filter((l) => statusOf(l, clips) === 'recorded').length
  const manifest = () =>
    JSON.stringify(Object.fromEntries([...(data?.full ?? []), ...(data?.short ?? [])].map((l) => [l.id, l.text])), null, 2) + '\n'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 grid place-items-center bg-ink/75 p-3 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vo-title"
            className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5"
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 14, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="vo-title" className="text-xl">
                  Voiceover script
                </h2>
                <p className="text-sm text-dim">The exact words to record, one file per line, built from the data the tour shows.</p>
              </div>
              <button onClick={close} aria-label="Close" className="rounded px-2 text-dim hover:bg-white/5 hover:text-text">
                ✕
              </button>
            </div>

            {USING_MOCK && (
              <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                These numbers are sample data. Record after the real data is connected, or lines with numbers will need re-recording.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div role="tablist" className="flex rounded border border-line p-0.5">
                {(['full', 'short'] as const).map((v) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={variant === v}
                    onClick={() => setVariant(v)}
                    className={`rounded px-3 py-1 text-[13px] ${variant === v ? 'bg-cyan/15 text-cyan' : 'text-dim hover:text-text'}`}
                  >
                    {v === 'full' ? 'Full tour' : '30-second cut'}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <CopyButton label="Copy script" get={() => scriptText(variant, lines)} />
                <CopyButton label="Copy manifest.json" get={manifest} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <div className="label">Length</div>
                <div className="readout text-2xl">{totalS.toFixed(0)} s</div>
              </div>
              <div>
                <div className="label">Words</div>
                <div className="readout text-2xl">{words}</div>
              </div>
              <div>
                <div className="label">Recorded</div>
                <div className="readout text-2xl">
                  {recorded}/{lines.length}
                </div>
              </div>
            </div>
            {variant === 'short' && totalS > 30.5 && (
              <p className="mt-2 text-sm text-warn">Over 30 s with these recordings. Read a little faster or trim a line.</p>
            )}

            <ol className="mt-4 space-y-2">
              {lines.map((l) => {
                const st = statusOf(l, clips)
                const clip = clips.get(l.id)
                const secs = clip && st === 'recorded' ? clip.duration : readingMs(l.text) / 1000
                return (
                  <li key={l.id} className="rounded border border-line px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-sm text-cyan">{l.id}.mp3</span>
                      <span className="label">{shotLabel(l.shot)}</span>
                      <span className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] ${STATUS_UI[st].cls}`}>{STATUS_UI[st].text}</span>
                    </div>
                    <p className="mt-1.5 text-[15px] leading-relaxed">{l.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-dim">
                      <span>
                        {wordCount(l.text)} words, {secs.toFixed(1)} s {st === 'recorded' ? 'recorded' : 'at a calm pace'}
                      </span>
                      {st === 'outdated' && clip && <span className="text-warn">Recorded as: “{clip.text}”</span>}
                      <span className="ml-auto flex gap-2">
                        {clip && st === 'recorded' && (
                          <button
                            onClick={() => {
                              primeVoice()
                              stopVoice()
                              scheduleClip(clip)
                            }}
                            className="rounded border border-line px-2 py-0.5 hover:text-text"
                          >
                            Play recording
                          </button>
                        )}
                        <button
                          onClick={() => {
                            primeVoice()
                            stopVoice()
                            void speakDraft(l.text)
                          }}
                          className="rounded border border-line px-2 py-0.5 hover:text-text"
                        >
                          Hear draft voice
                        </button>
                      </span>
                    </div>
                  </li>
                )
              })}
              {!data && <li className="h-24 animate-pulse rounded bg-line" />}
            </ol>

            <section className="mt-5 space-y-2 border-t border-line pt-4 text-sm leading-relaxed text-text/85">
              <h3 className="text-base">Recording, step by step</h3>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  Once the real data is connected, copy the script. Read every line as written, including the numbers. Say{' '}
                  {PRONUNCIATION.map((p) => p[2]).join(' and ')}.
                </li>
                <li>
                  One voice for every clip, one session, same mic and distance (a hand’s width). A small room with soft things in it, or a closet
                  of clothes, beats a big echoey room. Read a little slower than feels natural.
                </li>
                <li>Record two takes of each line. Name the best take after its file: 01.wav, 02.wav … s4.wav.</li>
                <li>
                  Run <code className="rounded bg-white/5 px-1">npm run voice:prepare -- path/to/takes</code>. It trims silence, adds a short
                  lead-in, evens out loudness and writes the mp3s into <code className="rounded bg-white/5 px-1">public/audio/tour/</code>.
                </li>
                <li>
                  Click “Copy manifest.json” and save it as <code className="rounded bg-white/5 px-1">public/audio/tour/manifest.json</code>. It
                  tells the app which words each clip contains, so a clip is never played over the wrong numbers.
                </li>
                <li>Reload and check this sheet: every line should say Recorded. Then play the tour once with sound before filming.</li>
              </ol>
              <p className="text-dim">
                The tour times every step to its recording, so there is nothing to sync by hand. For the submission video, use the 30-second cut
                and capture system audio with the screen recording.
              </p>
            </section>

            <section className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <span className="text-sm">Draft voice (browser speech) for lines without a recording</span>
              <div className="flex rounded border border-line p-0.5">
                {(
                  [
                    ['auto', 'Until recordings exist'],
                    ['on', 'Always'],
                    ['off', 'Never'],
                  ] as [DraftVoice, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setDraftVoice(k)}
                    aria-pressed={draftVoice === k}
                    className={`rounded px-2.5 py-1 text-[12.5px] ${draftVoice === k ? 'bg-cyan/15 text-cyan' : 'text-dim hover:text-text'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
