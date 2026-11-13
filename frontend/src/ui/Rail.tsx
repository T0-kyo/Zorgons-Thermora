/**
 * Collapsible side menus. Collapsed, a menu becomes a thin rail with its name set vertically;
 * click the rail (or press its key) to bring it back. State is remembered per browser.
 */
import { useCallback, useEffect, useState } from 'react'

export function usePanelState(id: string, initial = true): [boolean, () => void] {
  const key = `thermora:panel:${id}`
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? initial : v === '1'
    } catch {
      return initial
    }
  })
  const toggle = useCallback(() => {
    setOpen((o) => {
      try { localStorage.setItem(key, o ? '0' : '1') } catch { /* storage unavailable */ }
      return !o
    })
  }, [key])
  return [open, toggle]
}

/** Keyboard shortcut for a panel toggle (ignored while typing). */
export function usePanelKey(key: string, toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      if (e.key === key) toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, toggle])
}

/** The collapsed state of a side menu: a full-height strip with a vertical label. */
export function Rail({ label, side, onOpen, shortcut, controls }: { label: string; side: 'left' | 'right'; onOpen: () => void; shortcut: string; controls: string }) {
  return (
    <button
      onClick={onOpen}
      aria-expanded={false}
      aria-controls={controls}
      title={`Show ${label.toLowerCase()} (${shortcut})`}
      className={`group flex h-full w-full flex-col items-center gap-4 bg-black pt-6 text-dim transition-colors hover:text-text ${
        side === 'left' ? 'border-r' : 'border-l'
      } border-line`}
    >
      <span aria-hidden className="text-[15px] leading-none">{side === 'left' ? '›' : '‹'}</span>
      <span className="text-[13px] tracking-[0.01em] [writing-mode:vertical-rl]" style={side === 'left' ? { transform: 'rotate(180deg)' } : undefined}>
        {label}
      </span>
    </button>
  )
}

/** Small "hide" control placed in a menu's header. */
export function CollapseButton({ label, side, onClose, shortcut, controls }: { label: string; side: 'left' | 'right' | 'down'; onClose: () => void; shortcut: string; controls: string }) {
  const glyph = side === 'left' ? '‹' : side === 'right' ? '›' : '⌄'
  return (
    <button
      onClick={onClose}
      aria-expanded
      aria-controls={controls}
      title={`Hide ${label.toLowerCase()} (${shortcut})`}
      className="inline-flex h-6 w-6 items-center justify-center text-[16px] leading-none text-dim transition-colors hover:text-text"
    >
      <span aria-hidden>{glyph}</span>
      <span className="sr-only">Hide {label}</span>
    </button>
  )
}
