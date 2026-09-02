import { todayISO, addDays, dayIndex, toMin } from './utils'

export function subjectMap(db) {
  return Object.fromEntries(db.subjects.map((s) => [s.id, s]))
}

export function sessionsFor(db, day) {
  return db.sessions
    .filter((s) => s.day === day)
    .slice()
    .sort((a, b) => toMin(a.start) - toMin(b.start))
}

export function minutesOn(db, iso) {
  return db.logs.filter((l) => l.date === iso).reduce((a, b) => a + b.minutes, 0)
}

export function last7(db) {
  const out = []
  for (let i = 6; i >= 0; i--) {
    const iso = addDays(todayISO(), -i)
    out.push({ iso, minutes: minutesOn(db, iso) })
  }
  return out
}

export function last30(db) {
  const out = []
  for (let i = 29; i >= 0; i--) {
    const iso = addDays(todayISO(), -i)
    out.push({ iso, minutes: minutesOn(db, iso) })
  }
  return out
}

export function streak(db) {
  let n = 0
  let iso = todayISO()
  if (minutesOn(db, iso) === 0) iso = addDays(iso, -1)
  while (minutesOn(db, iso) > 0) {
    n++
    iso = addDays(iso, -1)
  }
  return n
}

export function bestStreak(db) {
  const dates = [...new Set(db.logs.filter((l) => l.minutes > 0).map((l) => l.date))].sort()
  let best = 0
  let cur = 0
  let prev = null
  for (const d of dates) {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1
    best = Math.max(best, cur)
    prev = d
  }
  return best
}

export function totalMinutes(db) {
  return db.logs.reduce((a, b) => a + b.minutes, 0)
}

export function minutesBySubject(db, days = 30) {
  const from = addDays(todayISO(), -(days - 1))
  const m = {}
  db.logs.filter((l) => l.date >= from).forEach((l) => {
    const k = l.subjectId || 'other'
    m[k] = (m[k] || 0) + l.minutes
  })
  return m
}

export function scheduledMinutes(db, day) {
  return sessionsFor(db, day).reduce((a, s) => a + Math.max(0, toMin(s.end) - toMin(s.start)), 0)
}

export function weeklyScheduled(db) {
  return [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + scheduledMinutes(db, d), 0)
}

export function upcomingTasks(db) {
  return db.tasks
    .filter((t) => !t.done)
    .slice()
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
}

export function overdueTasks(db) {
  const t = todayISO()
  return db.tasks.filter((x) => !x.done && x.due && x.due < t)
}

export function todayTasks(db) {
  const t = todayISO()
  return db.tasks.filter((x) => x.due === t)
}

export function nextSession(db) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const d0 = dayIndex(now)
  for (let i = 0; i < 8; i++) {
    const d = (d0 + i) % 7
    const list = sessionsFor(db, d)
    for (const s of list) {
      if (i > 0 || toMin(s.start) > nowMin) return { ...s, dayOffset: i }
    }
  }
  return null
}

export function currentSession(db) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return sessionsFor(db, dayIndex(now)).find((s) => toMin(s.start) <= nowMin && nowMin < toMin(s.end)) || null
}

export function nextExam(db) {
  const t = todayISO()
  return db.exams.filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0] || null
}

export function achievements(db) {
  const total = totalMinutes(db)
  const st = streak(db)
  const done = db.tasks.filter((t) => t.done).length
  const sess = db.logs.filter((l) => l.mode === 'focus').length
  return [
    { id: 'first', icon: '🌱', name: 'First Steps', desc: 'Complete your first focus session', done: sess >= 1, progress: Math.min(1, sess / 1) },
    { id: 'h1', icon: '⏱️', name: 'One Hour Club', desc: 'Study for 60 minutes in total', done: total >= 60, progress: Math.min(1, total / 60) },
    { id: 'h10', icon: '🔥', name: 'Ten Hour Hero', desc: 'Reach 10 hours of total focus', done: total >= 600, progress: Math.min(1, total / 600) },
    { id: 'h50', icon: '💎', name: 'Diamond Mind', desc: 'Reach 50 hours of total focus', done: total >= 3000, progress: Math.min(1, total / 3000) },
    { id: 's3', icon: '⚡', name: 'On a Roll', desc: '3-day study streak', done: st >= 3, progress: Math.min(1, st / 3) },
    { id: 's7', icon: '🏆', name: 'Week Warrior', desc: '7-day study streak', done: st >= 7, progress: Math.min(1, st / 7) },
    { id: 's30', icon: '👑', name: 'Unstoppable', desc: '30-day study streak', done: st >= 30, progress: Math.min(1, st / 30) },
    { id: 't10', icon: '✅', name: 'Task Crusher', desc: 'Complete 10 tasks', done: done >= 10, progress: Math.min(1, done / 10) },
    { id: 't50', icon: '🚀', name: 'Productivity Beast', desc: 'Complete 50 tasks', done: done >= 50, progress: Math.min(1, done / 50) },
    { id: 'p25', icon: '🍅', name: 'Pomodoro Pro', desc: 'Finish 25 focus sessions', done: sess >= 25, progress: Math.min(1, sess / 25) },
  ]
}

export function level(db) {
  const xp = totalMinutes(db) + db.tasks.filter((t) => t.done).length * 15
  const lvl = Math.floor(Math.sqrt(xp / 45)) + 1
  const cur = 45 * (lvl - 1) ** 2
  const next = 45 * lvl ** 2
  return { lvl, xp, cur, next, pct: next === cur ? 100 : ((xp - cur) / (next - cur)) * 100 }
}
