/**
 * OWNER: Agent B. Voiceover playback for the guided tour.
 *
 * - Clips: public/audio/tour/<id>.mp3 + manifest.json ({ "<id>": "<exact words recorded>" }).
 *   Static assets, not backend data, so they load here rather than via api.ts.
 *   A clip only plays if its recorded words still match the current line.
 * - Playback uses the Web Audio clock: every clip is decoded up front and the whole voice track
 *   is scheduled sample-accurately, so it stays in time even when the page stutters (heavy globe,
 *   weak laptop). The tour's visuals follow this clock.
 * - Draft voice: browser speech synthesis, for rehearsing before recordings exist.
 * - Browsers only allow sound after a user gesture: primeVoice() must run inside the click.
 */
import { readingMs } from './script'

export interface Clip {
  buffer: AudioBuffer
  /** seconds */
  duration: number
  /** words the clip was recorded with (from manifest.json) */
  text: string
}

const BASE = `${import.meta.env.BASE_URL}audio/tour/`

// ---- audio graph -------------------------------------------------------------------
let ctx: AudioContext | null = null
let out: GainNode | null = null
let mutedNow = false
const live = new Set<AudioBufferSourceNode>()

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    out = ctx.createGain()
    out.gain.value = mutedNow ? 0 : 1
    out.connect(ctx.destination)
  }
  return ctx
}

/** Call synchronously inside the click/tap that starts the tour. */
export function primeVoice() {
  const c = audio()
  if (c) {
    void c.resume().catch(() => {})
    try {
      const s = c.createBufferSource() // a 1-sample silent buffer unlocks iOS
      s.buffer = c.createBuffer(1, 1, 22050)
      s.connect(c.destination)
      s.start()
    } catch {
      /* ignore */
    }
  }
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
  } catch {
    /* ignore */
  }
  void loadClips()
}

/** Waits (briefly) for the clock to start after primeVoice(). False = no sound allowed. */
export async function ensureAudio(): Promise<boolean> {
  const c = audio()
  if (!c) return false
  if (c.state !== 'running') {
    await Promise.race([c.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))])
  }
  return c.state === 'running'
}

/** True once sound is allowed (the click resumed the audio clock). */
export const audioReady = () => !!ctx && ctx.state === 'running'
/** Seconds on the audio clock (only meaningful when audioReady()). */
export const audioNow = () => ctx?.currentTime ?? 0

export function setPlayerMuted(muted: boolean) {
  mutedNow = muted
  if (ctx && out) out.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03)
}

/** Schedules a clip at an audio-clock time (default: now). Returns when it should finish. */
export function scheduleClip(clip: Clip, when?: number) {
  const c = audio()
  if (!c || !out) return
  const s = c.createBufferSource()
  s.buffer = clip.buffer
  s.connect(out)
  s.onended = () => live.delete(s)
  live.add(s)
  s.start(Math.max(c.currentTime, when ?? c.currentTime))
}

export function stopVoice() {
  for (const s of live) {
    try {
      s.stop()
    } catch {
      /* already stopped */
    }
  }
  live.clear()
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}

// ---- recorded clips ----------------------------------------------------------------
let clipsP: Promise<Map<string, Clip>> | null = null

/** Loads manifest.json and decodes every clip it lists. Empty map = no recordings yet. */
export function loadClips(): Promise<Map<string, Clip>> {
  return (clipsP ??= (async () => {
    const found = new Map<string, Clip>()
    const c = audio()
    if (!c) return found
    let manifest: Record<string, string>
    try {
      const r = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' })
      if (!r.ok || (r.headers.get('content-type') ?? '').includes('html')) return found
      manifest = await r.json()
    } catch {
      return found
    }
    await Promise.all(
      Object.entries(manifest).map(async ([id, text]) => {
        try {
          const r = await fetch(`${BASE}${id}.mp3`)
          if (!r.ok || (r.headers.get('content-type') ?? '').includes('html')) return
          const buffer = await c.decodeAudioData(await r.arrayBuffer())
          found.set(id, { buffer, duration: buffer.duration, text })
        } catch {
          /* missing or unreadable: that step runs on captions */
        }
      }),
    )
    return found
  })())
}

// ---- draft voice (browser speech synthesis) ----------------------------------------
/** How the browser voice should say the sensor names. Narrators: same sounds. */
export const PRONUNCIATION: [RegExp, string, string][] = [
  [/\bMODIS\b/g, 'Moe-diss', 'MODIS = "MOH-dis"'],
  [/\bVIIRS\b/g, 'Veers', 'VIIRS = "veers"'],
]

function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 8 : 0) +
    (/google (uk|us) english/i.test(v.name) ? 5 : 0) +
    (/samantha|daniel|serena|aria|guy|jenny|libby|ryan/i.test(v.name) ? 4 : 0) +
    (/en-(gb|us)/i.test(v.lang) ? 2 : 0)
  return all.sort((a, b) => score(b) - score(a))[0] ?? null
}

/** Speaks a line with the browser voice; resolves when finished (with a safety timeout). */
export function speakDraft(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const spoken = PRONUNCIATION.reduce((s, [re, say]) => s.replace(re, say), text)
    const u = new SpeechSynthesisUtterance(spoken)
    const v = pickVoice()
    if (v) u.voice = v
    u.rate = 0.98
    const t = setTimeout(done, readingMs(text) * 1.8 + 2000)
    function done() {
      clearTimeout(t)
      resolve()
    }
    u.onend = done
    u.onerror = done
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  })
}
