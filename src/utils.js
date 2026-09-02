export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const PALETTE = [
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#06b6d4', '#f97316', '#a3e635', '#e879f9', '#14b8a6', '#facc15',
]

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** ISO date string (yyyy-mm-dd) in LOCAL time */
export const todayISO = (d = new Date()) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayISO(d)
}

/** 0 = Monday ... 6 = Sunday */
export const dayIndex = (d = new Date()) => (d.getDay() + 6) % 7

export const toMin = (hhmm) => {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export const fromMin = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const fmtTime = (hhmm, h12 = true) => {
  if (!hhmm) return ''
  if (!h12) return hhmm
  const [H, M] = hhmm.split(':').map(Number)
  const ap = H >= 12 ? 'PM' : 'AM'
  const h = H % 12 === 0 ? 12 : H % 12
  return `${h}:${String(M).padStart(2, '0')} ${ap}`
}

export const durationLabel = (mins) => {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

export const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const daysUntil = (iso) => {
  const a = new Date(todayISO() + 'T00:00:00')
  const b = new Date(iso + 'T00:00:00')
  return Math.round((b - a) / 86400000)
}

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

export const hexToRgba = (hex, a = 1) => {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(v, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export const greeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'Burning the midnight oil'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

export const QUOTES = [
  ['Small daily improvements are the key to staggering long-term results.', 'Robin Sharma'],
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Success is the sum of small efforts repeated day in and day out.', 'Robert Collier'],
  ['Don’t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
  ['Study while others are sleeping; work while others are loafing.', 'William A. Ward'],
  ['Discipline is choosing between what you want now and what you want most.', 'Abraham Lincoln'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['The expert in anything was once a beginner.', 'Helen Hayes'],
  ['You don’t have to be great to start, but you have to start to be great.', 'Zig Ziglar'],
  ['Focus on being productive instead of busy.', 'Tim Ferriss'],
]

export const quoteOfDay = () => {
  const seed = Number(todayISO().replace(/-/g, '')) % QUOTES.length
  return QUOTES[seed]
}

/** Simple beep using WebAudio — no external assets needed */
export function beep(times = 3) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    let t = ctx.currentTime
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(i % 2 ? 660 : 880, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.45)
      t += 0.5
    }
    setTimeout(() => ctx.close(), (times + 1) * 550)
  } catch { /* ignore */ }
}
