import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { uid, todayISO, PALETTE } from './utils'

const KEY = 'studyflow.v1'

export const THEMES = {
  galaxy: { name: 'Galaxy', c1: '#7c3aed', c2: '#ec4899', c3: '#f59e0b', bgDark: '#0b0a1f', bgLight: '#f5f1ff' },
  ocean: { name: 'Ocean', c1: '#0ea5e9', c2: '#06b6d4', c3: '#22d3ee', bgDark: '#04121f', bgLight: '#effbff' },
  sunset: { name: 'Sunset', c1: '#f43f5e', c2: '#f97316', c3: '#fbbf24', bgDark: '#1a0a10', bgLight: '#fff5ef' },
  forest: { name: 'Forest', c1: '#059669', c2: '#84cc16', c3: '#14b8a6', bgDark: '#04150f', bgLight: '#f0fdf4' },
  candy: { name: 'Candy', c1: '#d946ef', c2: '#f472b6', c3: '#818cf8', bgDark: '#170a20', bgLight: '#fdf2ff' },
  midnight: { name: 'Midnight', c1: '#6366f1', c2: '#3b82f6', c3: '#8b5cf6', bgDark: '#080b1c', bgLight: '#f1f4ff' },
}

const s = (name, color, teacher = '') => ({ id: uid(), name, color, teacher, target: 5 })

function seed() {
  const subs = [
    s('Mathematics', PALETTE[0], 'Mr. Sharma'),
    s('Physics', PALETTE[4], 'Ms. Rao'),
    s('Chemistry', PALETTE[3], 'Dr. Iyer'),
    s('English', PALETTE[1], 'Mrs. Fernandes'),
    s('Computer Science', PALETTE[6], 'Mr. Khan'),
    s('Biology', PALETTE[8], 'Ms. Dsouza'),
  ]
  const S = Object.fromEntries(subs.map((x) => [x.name, x.id]))
  const slot = (day, subject, start, end, room = '') => ({ id: uid(), day, subjectId: S[subject], start, end, room, note: '' })

  const sessions = [
    slot(0, 'Mathematics', '08:00', '09:30', 'Room 101'),
    slot(0, 'Physics', '10:00', '11:15', 'Lab 2'),
    slot(0, 'English', '14:00', '15:00', 'Room 204'),
    slot(1, 'Chemistry', '08:30', '10:00', 'Lab 1'),
    slot(1, 'Computer Science', '11:00', '12:30', 'Comp Lab'),
    slot(1, 'Mathematics', '16:00', '17:00', 'Self study'),
    slot(2, 'Biology', '09:00', '10:30', 'Room 303'),
    slot(2, 'Mathematics', '11:00', '12:00', 'Room 101'),
    slot(2, 'Physics', '15:00', '16:30', 'Self study'),
    slot(3, 'English', '08:00', '09:00', 'Room 204'),
    slot(3, 'Computer Science', '10:00', '11:30', 'Comp Lab'),
    slot(3, 'Chemistry', '14:30', '16:00', 'Self study'),
    slot(4, 'Mathematics', '08:00', '09:30', 'Room 101'),
    slot(4, 'Biology', '10:00', '11:00', 'Room 303'),
    slot(4, 'Physics', '13:00', '14:30', 'Lab 2'),
    slot(5, 'Revision Block', '10:00', '12:00', 'Home'),
    slot(6, 'Mock Test', '09:00', '11:00', 'Home'),
  ].map((x) => (x.subjectId ? x : { ...x, subjectId: subs[0].id }))

  // Fix the two weekend blocks to real subjects
  sessions[15] = { ...sessions[15], subjectId: subs[2].id, note: 'Weekly revision' }
  sessions[16] = { ...sessions[16], subjectId: subs[1].id, note: 'Full syllabus mock' }

  const t = (title, sub, dueOffset, priority) => ({
    id: uid(), title, subjectId: S[sub], due: addISO(dueOffset), priority, done: false, notes: '', createdAt: Date.now(),
  })

  return {
    version: 1,
    profile: { name: 'Bhavesh', avatar: '🚀' },
    subjects: subs,
    sessions,
    tasks: [
      t('Finish Integration worksheet', 'Mathematics', 1, 'high'),
      t('Physics numericals — Ch. 4', 'Physics', 2, 'medium'),
      t('Write essay on Climate Change', 'English', 3, 'medium'),
      t('Organic chemistry revision notes', 'Chemistry', 0, 'high'),
      t('Build a React practice project', 'Computer Science', 5, 'low'),
    ],
    exams: [
      { id: uid(), title: 'Unit Test — Mathematics', subjectId: S['Mathematics'], date: addISO(7), time: '09:00', syllabus: 'Chapters 1–5' },
      { id: uid(), title: 'Physics Practical', subjectId: S['Physics'], date: addISO(14), time: '11:00', syllabus: 'All experiments' },
      { id: uid(), title: 'Final Exams Begin', subjectId: S['Chemistry'], date: addISO(30), time: '09:30', syllabus: 'Full syllabus' },
    ],
    notes: [
      { id: uid(), title: 'Formula: Quadratic', body: 'x = (-b ± √(b² − 4ac)) / 2a\n\nDiscriminant D = b² − 4ac\nD > 0 → two real roots\nD = 0 → equal roots\nD < 0 → complex roots', subjectId: S['Mathematics'], color: PALETTE[0], pinned: true, updatedAt: Date.now() },
      { id: uid(), title: "Newton's Laws", body: '1. An object stays at rest or uniform motion unless acted on by a force.\n2. F = m·a\n3. Every action has an equal and opposite reaction.', subjectId: S['Physics'], color: PALETTE[4], pinned: false, updatedAt: Date.now() },
    ],
    logs: [],
    settings: {
      theme: 'galaxy',
      dark: true,
      h12: true,
      dailyGoal: 180,
      sound: true,
      pomodoro: { focus: 25, short: 5, long: 15, rounds: 4 },
      dayStart: 7,
      dayEnd: 22,
    },
  }
}

function addISO(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return todayISO(d)
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seed()
    const data = JSON.parse(raw)
    const base = seed()
    return {
      ...base,
      ...data,
      profile: { ...base.profile, ...(data.profile || {}) },
      settings: {
        ...base.settings,
        ...(data.settings || {}),
        pomodoro: { ...base.settings.pomodoro, ...((data.settings || {}).pomodoro || {}) },
      },
    }
  } catch {
    return seed()
  }
}

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load)
  const [toasts, setToasts] = useState([])
  const [confetti, setConfetti] = useState(0)
  const timers = useRef({})

  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota */ }
    }, 120)
    return () => clearTimeout(id)
  }, [db])

  // Apply theme variables
  useEffect(() => {
    const t = THEMES[db.settings.theme] || THEMES.galaxy
    const r = document.documentElement
    r.style.setProperty('--c1', t.c1)
    r.style.setProperty('--c2', t.c2)
    r.style.setProperty('--c3', t.c3)
    r.style.setProperty('--bg', db.settings.dark ? t.bgDark : t.bgLight)
    r.classList.toggle('dark', db.settings.dark)
  }, [db.settings.theme, db.settings.dark])

  const toast = useCallback((msg, kind = 'success') => {
    const id = uid()
    setToasts((t) => [...t, { id, msg, kind }])
    timers.current[id] = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  const party = useCallback(() => setConfetti((c) => c + 1), [])

  const up = useCallback((fn) => setDb((d) => fn({ ...d })), [])
  const setList = useCallback((key, fn) => setDb((d) => ({ ...d, [key]: fn(d[key]) })), [])

  const api = useMemo(() => ({
    db,
    toast,
    party,
    confetti,
    toasts,
    dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),

    setSettings: (patch) => up((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    setProfile: (patch) => up((d) => ({ ...d, profile: { ...d.profile, ...patch } })),

    // Subjects
    addSubject: (v) => setList('subjects', (l) => [...l, { id: uid(), target: 5, teacher: '', color: PALETTE[l.length % PALETTE.length], ...v }]),
    updateSubject: (id, v) => setList('subjects', (l) => l.map((x) => (x.id === id ? { ...x, ...v } : x))),
    removeSubject: (id) => up((d) => ({
      ...d,
      subjects: d.subjects.filter((x) => x.id !== id),
      sessions: d.sessions.filter((x) => x.subjectId !== id),
      tasks: d.tasks.map((x) => (x.subjectId === id ? { ...x, subjectId: null } : x)),
      exams: d.exams.filter((x) => x.subjectId !== id),
      notes: d.notes.map((x) => (x.subjectId === id ? { ...x, subjectId: null } : x)),
    })),

    // Timetable sessions
    addSession: (v) => setList('sessions', (l) => [...l, { id: uid(), room: '', note: '', ...v }]),
    updateSession: (id, v) => setList('sessions', (l) => l.map((x) => (x.id === id ? { ...x, ...v } : x))),
    removeSession: (id) => setList('sessions', (l) => l.filter((x) => x.id !== id)),
    duplicateSession: (id, day) => setList('sessions', (l) => {
      const src = l.find((x) => x.id === id)
      return src ? [...l, { ...src, id: uid(), day: day ?? src.day }] : l
    }),
    clearDay: (day) => setList('sessions', (l) => l.filter((x) => x.day !== day)),
    copyDay: (from, to) => setList('sessions', (l) => [
      ...l.filter((x) => x.day !== to),
      ...l.filter((x) => x.day === from).map((x) => ({ ...x, id: uid(), day: to })),
    ]),

    // Tasks
    addTask: (v) => setList('tasks', (l) => [{ id: uid(), done: false, priority: 'medium', notes: '', createdAt: Date.now(), ...v }, ...l]),
    updateTask: (id, v) => setList('tasks', (l) => l.map((x) => (x.id === id ? { ...x, ...v } : x))),
    toggleTask: (id) => setList('tasks', (l) => l.map((x) => (x.id === id ? { ...x, done: !x.done, doneAt: !x.done ? Date.now() : null } : x))),
    removeTask: (id) => setList('tasks', (l) => l.filter((x) => x.id !== id)),
    clearDone: () => setList('tasks', (l) => l.filter((x) => !x.done)),

    // Exams
    addExam: (v) => setList('exams', (l) => [...l, { id: uid(), syllabus: '', time: '09:00', ...v }]),
    updateExam: (id, v) => setList('exams', (l) => l.map((x) => (x.id === id ? { ...x, ...v } : x))),
    removeExam: (id) => setList('exams', (l) => l.filter((x) => x.id !== id)),

    // Notes
    addNote: (v) => setList('notes', (l) => [{ id: uid(), title: 'Untitled note', body: '', color: PALETTE[l.length % PALETTE.length], pinned: false, updatedAt: Date.now(), ...v }, ...l]),
    updateNote: (id, v) => setList('notes', (l) => l.map((x) => (x.id === id ? { ...x, ...v, updatedAt: Date.now() } : x))),
    removeNote: (id) => setList('notes', (l) => l.filter((x) => x.id !== id)),

    // Focus logs
    addLog: (minutes, subjectId = null, mode = 'focus') =>
      setList('logs', (l) => [...l, { id: uid(), date: todayISO(), minutes, subjectId, mode, at: Date.now() }]),
    removeLog: (id) => setList('logs', (l) => l.filter((x) => x.id !== id)),

    // Data
    exportData: () => JSON.stringify(db, null, 2),
    importData: (json) => {
      const parsed = JSON.parse(json)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid file')
      const base = seed()
      setDb({ ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } })
    },
    resetAll: () => setDb(seed()),
    wipeAll: () => setDb({ ...seed(), subjects: [], sessions: [], tasks: [], exams: [], notes: [], logs: [] }),
  }), [db, confetti, toasts, toast, party, up, setList])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
