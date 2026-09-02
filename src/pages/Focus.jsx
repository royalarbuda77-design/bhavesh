import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Card, Button, Icon, SectionTitle, Chip, Ring, Field } from '../components/ui'
import { subjectMap, minutesOn, streak } from '../stats'
import { todayISO, durationLabel, beep, hexToRgba } from '../utils'

const MODES = {
  focus: { label: 'Focus', key: 'focus', emoji: '🎯' },
  short: { label: 'Short Break', key: 'short', emoji: '☕' },
  long: { label: 'Long Break', key: 'long', emoji: '🌴' },
}

export default function Focus() {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const cfg = db.settings.pomodoro

  const [mode, setMode] = useState('focus')
  const [left, setLeft] = useState(cfg.focus * 60)
  const [running, setRunning] = useState(false)
  const [round, setRound] = useState(1)
  const [subjectId, setSubjectId] = useState(db.subjects[0]?.id || '')
  const total = cfg[mode] * 60
  const tickRef = useRef(null)
  const endRef = useRef(null)

  // reset timer when mode / config changes while paused
  useEffect(() => {
    if (!running) setLeft(cfg[mode] * 60)
  }, [mode, cfg.focus, cfg.short, cfg.long]) // eslint-disable-line

  useEffect(() => {
    if (!running) return
    endRef.current = Date.now() + left * 1000
    tickRef.current = setInterval(() => {
      const rem = Math.round((endRef.current - Date.now()) / 1000)
      if (rem <= 0) {
        clearInterval(tickRef.current)
        setLeft(0)
        setRunning(false)
        complete()
      } else setLeft(rem)
    }, 250)
    return () => clearInterval(tickRef.current)
  }, [running]) // eslint-disable-line

  useEffect(() => {
    const m = Math.floor(left / 60)
    const s = left % 60
    document.title = running
      ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} · ${MODES[mode].label} — StudyFlow`
      : 'StudyFlow · Study Timetable & Planner'
    return () => { document.title = 'StudyFlow · Study Timetable & Planner' }
  }, [left, running, mode])

  function complete() {
    if (db.settings.sound) beep(mode === 'focus' ? 3 : 2)
    if (mode === 'focus') {
      st.addLog(cfg.focus, subjectId || null, 'focus')
      st.party()
      st.toast(`Focus session complete! +${cfg.focus} min logged 🎉`)
      const nextRound = round + 1
      const isLong = round % cfg.rounds === 0
      setRound(nextRound)
      setMode(isLong ? 'long' : 'short')
      setLeft((isLong ? cfg.long : cfg.short) * 60)
    } else {
      st.toast('Break over — back to work! 💪')
      setMode('focus')
      setLeft(cfg.focus * 60)
    }
  }

  const skip = () => {
    setRunning(false)
    if (mode === 'focus') {
      const spent = Math.round((total - left) / 60)
      if (spent >= 1) { st.addLog(spent, subjectId || null, 'focus'); st.toast(`${spent} min logged 👍`) }
      setMode(round % cfg.rounds === 0 ? 'long' : 'short')
      setRound(round + 1)
      setLeft((round % cfg.rounds === 0 ? cfg.long : cfg.short) * 60)
    } else {
      setMode('focus')
      setLeft(cfg.focus * 60)
    }
  }

  const reset = () => { setRunning(false); setLeft(cfg[mode] * 60) }

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const pct = total ? ((total - left) / total) * 100 : 0

  const todayMin = minutesOn(db, todayISO())
  const goal = db.settings.dailyGoal || 180
  const todayLogs = db.logs.filter((l) => l.date === todayISO()).slice().reverse()

  const manual = (m) => { st.addLog(m, subjectId || null, 'manual'); st.toast(`${m} minutes logged ⏱️`) }

  return (
    <div className="space-y-6">
      <SectionTitle icon={Icon.clock} title="Focus Timer" sub="Pomodoro technique · stay in the zone and log your study time" />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="relative overflow-hidden p-6 text-center xl:col-span-2 sm:p-10">
          <div className="pointer-events-none absolute inset-0 opacity-40 blur-3xl transition-opacity duration-700"
            style={{ background: running ? `radial-gradient(circle at 50% 40%, ${mode === 'focus' ? 'var(--c2)' : '#10b981'}, transparent 62%)` : 'transparent' }} />

          <div className="relative">
            <div className="mb-6 flex flex-wrap justify-center gap-2">
              {Object.values(MODES).map((m) => (
                <Chip key={m.key} active={mode === m.key} onClick={() => { setRunning(false); setMode(m.key); setLeft(cfg[m.key] * 60) }}>
                  {m.emoji} {m.label}
                </Chip>
              ))}
            </div>

            <div className="relative mx-auto grid place-items-center" style={{ width: 300, height: 300 }}>
              <svg width="300" height="300" className="-rotate-90">
                <defs>
                  <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={mode === 'focus' ? 'var(--c1)' : '#10b981'} />
                    <stop offset="100%" stopColor={mode === 'focus' ? 'var(--c2)' : '#22d3ee'} />
                  </linearGradient>
                </defs>
                <circle cx="150" cy="150" r="132" stroke="currentColor" strokeOpacity=".12" strokeWidth="16" fill="none" />
                <circle cx="150" cy="150" r="132" stroke="url(#focusGrad)" strokeWidth="16" fill="none" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 132}
                  strokeDashoffset={2 * Math.PI * 132 - (pct / 100) * 2 * Math.PI * 132}
                  style={{ transition: 'stroke-dashoffset .3s linear', filter: running ? 'drop-shadow(0 0 14px var(--c2))' : 'none' }} />
              </svg>
              <div className="absolute">
                <p className={`font-display text-6xl font-black tabular-nums sm:text-7xl ${running ? 'grad-text' : ''}`}>{mm}:{ss}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[.25em] opacity-55">
                  {MODES[mode].label} · Round {round}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" className="!px-9 !py-3.5 !text-base" icon={running ? Icon.pause : Icon.play} onClick={() => setRunning((r) => !r)}>
                {running ? 'Pause' : left === total ? 'Start' : 'Resume'}
              </Button>
              <Button icon={Icon.reset} onClick={reset}>Reset</Button>
              <Button icon={Icon.bolt} onClick={skip}>Skip</Button>
            </div>

            <div className="mx-auto mt-7 max-w-sm">
              <Field label="Studying">
                <select className="inp" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">General study</option>
                  {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-6 flex justify-center gap-1.5">
              {Array.from({ length: cfg.rounds }, (_, i) => (
                <span key={i} className="h-2.5 w-8 rounded-full transition-all"
                  style={{ background: i < (round - 1) % cfg.rounds ? 'var(--c2)' : 'rgba(255,255,255,.15)' }} />
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="flex flex-col items-center p-6">
            <h3 className="mb-4 self-start font-display text-lg font-extrabold">Today’s Progress</h3>
            <Ring id="focusday" value={(todayMin / goal) * 100} size={160} stroke={14} label={durationLabel(todayMin)} sub={`goal ${durationLabel(goal)}`} />
            <div className="mt-5 grid w-full grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-display text-xl font-extrabold">{db.logs.filter((l) => l.date === todayISO()).length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-55">Sessions</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-display text-xl font-extrabold">🔥 {streak(db)}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-55">Day streak</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-3 font-display text-lg font-extrabold">Log time manually</h3>
            <div className="flex flex-wrap gap-2">
              {[10, 15, 25, 30, 45, 60, 90].map((m) => (
                <Chip key={m} onClick={() => manual(m)}>+{m}m</Chip>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-3 font-display text-lg font-extrabold">Today’s Log</h3>
            {todayLogs.length === 0 ? (
              <p className="py-4 text-center text-sm opacity-55">No sessions logged yet today.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {todayLogs.map((l) => {
                  const sub = smap[l.subjectId]
                  return (
                    <div key={l.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-2.5 text-sm"
                      style={{ background: hexToRgba(sub?.color || '#8b5cf6', 0.12) }}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sub?.color || '#8b5cf6' }} />
                      <span className="min-w-0 flex-1 truncate">{sub?.name || 'General study'}</span>
                      <span className="text-xs font-bold opacity-70">{l.minutes}m</span>
                      <button className="opacity-40 hover:opacity-100" title="Remove" onClick={() => st.removeLog(l.id)}>
                        <Icon.x className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
