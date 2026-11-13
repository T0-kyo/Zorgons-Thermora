/**
 * OWNER: Agent B. B14 — place search (offline gazetteer + OpenStreetMap via api.searchPlaces).
 * Debounced 250 ms, stale answers ignored, full keyboard support (↑ ↓ Enter Esc).
 * Picking calls setPlace(place): the globe flies there and drops a marker (Agent A).
 * Clicking anywhere on the globe also picks a place.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../shared/api'
import { useApp } from '../shared/store'
import type { Place } from '../shared/types'

export default function PlaceSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    const query = q.trim()
    const id = ++seq.current
    if (query.length < 2) return
    const t = setTimeout(() => {
      setBusy(true)
      searchPlaces(query)
        .then((r) => {
          if (id !== seq.current) return // a newer search started: drop this answer
          setResults(r)
          setActive(0)
        })
        .catch(() => id === seq.current && setResults([]))
        .finally(() => id === seq.current && setBusy(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const pick = (p: Place) => {
    const st = useApp.getState()
    st.stopTour()
    st.setPlace(p)
    setQ('')
    setResults([])
    setOpen(false)
    input.current?.blur()
  }

  const short = q.trim().length < 2
  const showList = open && !short
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') {
      if (q) setQ('')
      else input.current?.blur()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded border border-line bg-ink/50 px-2.5 focus-within:border-cyan/60">
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-dim" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            if (e.target.value.trim().length < 2) setResults([])
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          placeholder="Search a place, e.g. Lahore or Kalimantan"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] outline-none placeholder:text-dim/70"
        />
        {busy && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-dim border-t-transparent" aria-label="Searching" />}
        {q && !busy && (
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => setQ('')} aria-label="Clear search" className="text-dim hover:text-text">
            ✕
          </button>
        )}
      </div>
      {open && short && <p className="mt-1 px-1 text-[12px] text-dim">Or click anywhere on the globe.</p>}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="panel absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto p-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
              className={`cursor-pointer rounded px-2 py-1.5 ${i === active ? 'bg-cyan/10' : ''}`}
            >
              <div className="text-[14px]">{p.name}</div>
              <div className={`text-[12px] ${p.regionId ? 'text-dim' : 'text-warn/80'}`}>{p.context}</div>
            </li>
          ))}
          {!busy && results.length === 0 && <li className="px-2 py-2 text-[13px] text-dim">No places found. Try a city or a country, or click the globe.</li>}
          {busy && results.length === 0 && <li className="px-2 py-2 text-[13px] text-dim">Searching</li>}
        </ul>
      )}
    </div>
  )
}

/** The picked place as a removable chip. */
export function PlaceChip() {
  const place = useApp((s) => s.place)
  const setPlace = useApp((s) => s.setPlace)
  if (!place) return null
  return (
    <button
      onClick={() => setPlace(null)}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan/10 py-0.5 pr-2.5 pl-2 text-[13px] text-cyan hover:border-cyan"
      aria-label={`Remove place ${place.name}`}
      title="Remove this place"
    >
      <span aria-hidden className="text-cyan/70 group-hover:text-cyan">
        ×
      </span>
      <span className="truncate">{place.name}</span>
    </button>
  )
}
