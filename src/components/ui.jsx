import React, { useEffect, useState } from 'react'

/* ---------------- Icons (inline, no dependency) ---------------- */
const P = (d) => (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {d}
  </svg>
)

export const Icon = {
  home: P(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>),
  grid: P(<><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>),
  check: P(<><path d="M20 6 9 17l-5-5" /></>),
  clock: P(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  book: P(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M8 3v14" /></>),
  fire: P(<><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s.5 2 2 2c0-3 2-5 2-8z" /></>),
  chart: P(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>),
  note: P(<><path d="M5 3h9l5 5v13H5z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h5" /></>),
  cal: P(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>),
  gear: P(<><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z" /></>),
  plus: P(<><path d="M12 5v14M5 12h14" /></>),
  trash: P(<><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></>),
  edit: P(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  x: P(<><path d="M18 6 6 18M6 6l12 12" /></>),
  play: P(<><path d="M7 4.5 19 12 7 19.5z" /></>),
  pause: P(<><rect x="7" y="5" width="3.5" height="14" rx="1" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" /></>),
  reset: P(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>),
  copy: P(<><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>),
  down: P(<><path d="M12 3v13" /><path d="m6.5 11.5 5.5 5.5 5.5-5.5" /><path d="M4 21h16" /></>),
  up: P(<><path d="M12 21V8" /><path d="m6.5 12.5 5.5-5.5 5.5 5.5" /><path d="M4 3h16" /></>),
  star: P(<><path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.3-.9z" /></>),
  trophy: P(<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" /><path d="M12 13v4M9 21h6M10 17h4" /></>),
  search: P(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  bulb: P(<><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 1 3.5 10.9c-.4.3-.5.7-.5 1.1v1h-6v-1c0-.4-.1-.8-.5-1.1A6 6 0 0 1 12 3z" /></>),
  print: P(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 17h10v4H7z" /></>),
  moon: P(<><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" /></>),
  sun: P(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>),
  menu: P(<><path d="M4 7h16M4 12h16M4 17h16" /></>),
  target: P(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>),
  bolt: P(<><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></>),
}

/* ---------------- Buttons ---------------- */
export function Button({ children, variant = 'ghost', className = '', icon: I, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none'
  const styles = {
    primary: 'grad-btn text-white',
    ghost: 'glass hover:border-white/30 hover:-translate-y-0.5',
    soft: 'bg-white/10 hover:bg-white/20 border border-white/10',
    danger: 'bg-rose-500/85 text-white hover:bg-rose-500 shadow-lg shadow-rose-500/25',
    plain: 'hover:bg-white/10',
  }
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {I && <I className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  )
}

export function IconBtn({ icon: I, title, className = '', ...rest }) {
  return (
    <button
      title={title}
      aria-label={title}
      className={`grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 transition hover:scale-110 hover:bg-white/20 active:scale-95 ${className}`}
      {...rest}
    >
      <I className="h-4 w-4" />
    </button>
  )
}

/* ---------------- Card ---------------- */
export function Card({ children, className = '', hover = false, ...rest }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`} {...rest}>{children}</div>
}

export function SectionTitle({ icon: I, title, sub, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          {I && (
            <span className="grid h-10 w-10 place-items-center rounded-2xl text-white" style={{ backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c2))' }}>
              <I className="h-5 w-5" />
            </span>
          )}
          <span className="grad-text">{title}</span>
        </h2>
        {sub && <p className="mt-1 text-sm opacity-60">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_.2s_ease]" onClick={onClose} />
      <div className={`card animate-pop relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="font-display text-xl font-extrabold grad-text">{title}</h3>
          <IconBtn icon={Icon.x} title="Close" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------- Field ---------------- */
export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  )
}

/* ---------------- Progress Ring ---------------- */
export function Ring({ value = 0, size = 120, stroke = 11, label, sub, gradient = ['var(--c1)', 'var(--c2)'], id = 'r' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const gid = `ring-${id}`
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="100%" stopColor={gradient[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeOpacity=".14" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gid})`} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-display text-xl font-extrabold sm:text-2xl">{label ?? `${Math.round(pct)}%`}</div>
        {sub && <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-55">{sub}</div>}
      </div>
    </div>
  )
}

/* ---------------- Progress Bar ---------------- */
export function Bar({ value, color = 'var(--c2)', height = 8 }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/10" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundImage: `linear-gradient(90deg, var(--c1), ${color})` }}
      />
    </div>
  )
}

/* ---------------- Empty state ---------------- */
export function Empty({ icon: I = Icon.bulb, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/20 px-6 py-14 text-center">
      <div className="grid h-16 w-16 animate-float place-items-center rounded-3xl text-white" style={{ backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c3))' }}>
        <I className="h-7 w-7" />
      </div>
      <p className="font-display text-lg font-bold">{title}</p>
      {sub && <p className="max-w-sm text-sm opacity-60">{sub}</p>}
      {action}
    </div>
  )
}

/* ---------------- Toasts ---------------- */
export function Toasts({ items, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[95] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 sm:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="pointer-events-auto animate-pop cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-2xl"
          style={{ backgroundImage: t.kind === 'error' ? 'linear-gradient(100deg,#ef4444,#f97316)' : 'linear-gradient(100deg,var(--c1),var(--c2))' }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}

/* ---------------- Confetti ---------------- */
export function Confetti({ trigger }) {
  const [pieces, setPieces] = useState([])
  useEffect(() => {
    if (!trigger) return
    const colors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e', '#22d3ee']
    const arr = Array.from({ length: 70 }, (_, i) => ({
      id: `${trigger}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 2 + Math.random() * 1.8,
      color: colors[i % colors.length],
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 12,
    }))
    setPieces(arr)
    const t = setTimeout(() => setPieces([]), 4600)
    return () => clearTimeout(t)
  }, [trigger])

  return (
    <>
      {pieces.map((p) => (
        <i
          key={p.id}
          className="confetti-piece"
          style={{ left: `${p.left}vw`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: p.w, height: p.h }}
        />
      ))}
    </>
  )
}

export function Chip({ children, active, color, ...rest }) {
  return (
    <button
      {...rest}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
        active ? 'border-transparent text-white shadow-lg' : 'border-white/15 bg-white/5 opacity-70 hover:opacity-100'
      }`}
      style={active ? { backgroundImage: `linear-gradient(100deg, var(--c1), ${color || 'var(--c2)'})` } : undefined}
    >
      {children}
    </button>
  )
}
