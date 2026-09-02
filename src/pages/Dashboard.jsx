import React, { useMemo } from 'react'
import { useStore } from '../store'
import { Card, Ring, Bar, Icon, Button, Empty } from '../components/ui'
import {
  streak, last7, minutesOn, sessionsFor, subjectMap, nextSession, currentSession,
  upcomingTasks, overdueTasks, nextExam, level, scheduledMinutes, achievements,
} from '../stats'
import { DAYS, DAYS_SHORT, dayIndex, fmtTime, todayISO, durationLabel, greeting, quoteOfDay, daysUntil, hexToRgba, toMin } from '../utils'

export default function Dashboard({ go }) {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const today = dayIndex()
  const todaySessions = sessionsFor(db, today)
  const mins = minutesOn(db, todayISO())
  const goal = db.settings.dailyGoal || 180
  const week = last7(db)
  const maxWeek = Math.max(60, ...week.map((w) => w.minutes))
  const cur = currentSession(db)
  const nxt = nextSession(db)
  const up = upcomingTasks(db).slice(0, 5)
  const over = overdueTasks(db)
  const exam = nextExam(db)
  const lv = level(db)
  const stk = streak(db)
  const [q, qa] = quoteOfDay()
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const unlocked = achievements(db).filter((a) => a.done).length

  const stats = [
    { label: 'Today', value: durationLabel(mins), icon: Icon.clock, g: ['var(--c1)', 'var(--c2)'] },
    { label: 'Streak', value: `${stk} day${stk === 1 ? '' : 's'}`, icon: Icon.fire, g: ['#f97316', '#ef4444'] },
    { label: 'Level', value: `Lv. ${lv.lvl}`, icon: Icon.bolt, g: ['#8b5cf6', '#06b6d4'] },
    { label: 'Badges', value: `${unlocked}/10`, icon: Icon.trophy, g: ['#f59e0b', '#facc15'] },
  ]

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: 'var(--c2)' }} />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--c3)' }} />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[.2em] opacity-60">
              {DAYS[today]} · {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
            </p>
            <h1 className="mt-2 font-display text-3xl font-black leading-tight sm:text-5xl">
              {greeting()}, <span className="grad-text">{db.profile.name || 'Scholar'}</span> {db.profile.avatar}
            </h1>
            <p className="mt-3 max-w-xl text-sm opacity-70">
              You have <b>{todaySessions.length}</b> session{todaySessions.length === 1 ? '' : 's'} scheduled
              ({durationLabel(scheduledMinutes(db, today))}) and <b>{up.length}</b> pending task{up.length === 1 ? '' : 's'}.
              {over.length > 0 && <span className="text-rose-400 font-bold"> {over.length} overdue!</span>}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" icon={Icon.play} onClick={() => go('focus')}>Start Focus Session</Button>
              <Button icon={Icon.plus} onClick={() => go('timetable')}>Timetable</Button>
              <Button icon={Icon.check} onClick={() => go('tasks')}>Tasks</Button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-5">
            <Ring
              id="today"
              value={(mins / goal) * 100}
              size={150}
              stroke={13}
              label={durationLabel(mins)}
              sub={`of ${durationLabel(goal)} goal`}
            />
          </div>
        </div>

        {/* XP bar */}
        <div className="relative mt-6">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
            <span className="opacity-70">Level {lv.lvl} · {lv.xp} XP</span>
            <span className="opacity-50">{Math.max(0, lv.next - lv.xp)} XP to Level {lv.lvl + 1}</span>
          </div>
          <Bar value={lv.pct} height={10} color="var(--c3)" />
        </div>
      </Card>

      {/* Stat tiles */}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} hover className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ backgroundImage: `linear-gradient(135deg, ${s.g[0]}, ${s.g[1]})` }}>
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-55">{s.label}</p>
                <p className="truncate font-display text-xl font-extrabold">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Today's timetable */}
        <Card className="p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl font-extrabold">Today’s Schedule</h3>
            <Button variant="plain" className="text-xs" onClick={() => go('timetable')}>View week →</Button>
          </div>

          {todaySessions.length === 0 ? (
            <Empty icon={Icon.cal} title="Nothing scheduled today" sub="Enjoy the break, or add a study block to keep the streak alive."
              action={<Button variant="primary" icon={Icon.plus} onClick={() => go('timetable')}>Add a block</Button>} />
          ) : (
            <div className="space-y-2.5">
              {todaySessions.map((s) => {
                const sub = smap[s.subjectId]
                const active = cur?.id === s.id
                const past = toMin(s.end) <= nowMin
                const color = sub?.color || '#8b5cf6'
                return (
                  <div
                    key={s.id}
                    className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-3.5 transition hover:-translate-y-0.5 ${
                      active ? 'border-white/40 animate-ringPulse' : 'border-white/10'
                    } ${past ? 'opacity-45' : ''}`}
                    style={{ background: `linear-gradient(100deg, ${hexToRgba(color, active ? 0.35 : 0.16)}, transparent 75%)` }}
                  >
                    <div className="w-1.5 self-stretch rounded-full" style={{ background: color }} />
                    <div className="min-w-[74px] text-center">
                      <p className="font-display text-sm font-extrabold">{fmtTime(s.start, db.settings.h12)}</p>
                      <p className="text-[10px] opacity-55">{fmtTime(s.end, db.settings.h12)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{sub?.name || 'Study block'}</p>
                      <p className="truncate text-xs opacity-60">
                        {[s.room, sub?.teacher, s.note].filter(Boolean).join(' · ') || durationLabel(toMin(s.end) - toMin(s.start))}
                      </p>
                    </div>
                    {active && <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">Now</span>}
                    <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold sm:block">
                      {durationLabel(toMin(s.end) - toMin(s.start))}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {nxt && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
              <Icon.clock className="h-5 w-5 shrink-0 opacity-70" />
              <p className="text-sm">
                <b>Up next:</b> {smap[nxt.subjectId]?.name || 'Study'} ·{' '}
                {nxt.dayOffset === 0 ? 'today' : nxt.dayOffset === 1 ? 'tomorrow' : DAYS[nxt.day]} at {fmtTime(nxt.start, db.settings.h12)}
              </p>
            </div>
          )}
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* Weekly chart */}
          <Card className="p-6">
            <h3 className="mb-4 font-display text-lg font-extrabold">Last 7 Days</h3>
            <div className="flex h-36 items-end gap-2">
              {week.map((w, i) => {
                const h = Math.max(4, (w.minutes / maxWeek) * 100)
                const isToday = i === 6
                return (
                  <div key={w.iso} className="group flex flex-1 flex-col items-center gap-2">
                    <span className="text-[10px] font-bold opacity-0 transition group-hover:opacity-70">{w.minutes}m</span>
                    <div
                      className="w-full rounded-t-xl transition-all duration-500 hover:opacity-100"
                      style={{
                        height: `${h}%`,
                        backgroundImage: `linear-gradient(180deg, var(--c2), var(--c1))`,
                        opacity: isToday ? 1 : 0.55,
                        boxShadow: isToday ? '0 0 22px -4px var(--c2)' : 'none',
                      }}
                    />
                    <span className={`text-[10px] font-bold ${isToday ? 'opacity-100' : 'opacity-45'}`}>
                      {DAYS_SHORT[(new Date(w.iso + 'T00:00:00').getDay() + 6) % 7]}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Next exam */}
          {exam && (
            <Card className="relative overflow-hidden p-6">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-30 blur-2xl" style={{ background: '#ef4444' }} />
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-55">Next Exam</p>
              <p className="mt-1 font-display text-lg font-extrabold">{exam.title}</p>
              <p className="text-xs opacity-60">{smap[exam.subjectId]?.name}</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-display text-4xl font-black grad-text">{Math.max(0, daysUntil(exam.date))}</span>
                <span className="mb-1 text-sm font-bold opacity-70">days to go</span>
              </div>
              <Button variant="soft" className="mt-4 w-full text-xs" onClick={() => go('exams')}>All exams</Button>
            </Card>
          )}

          {/* Quote */}
          <Card className="p-6">
            <Icon.bulb className="h-6 w-6" style={{ color: 'var(--c3)' }} />
            <p className="mt-3 font-display text-base font-semibold italic leading-relaxed">“{q}”</p>
            <p className="mt-2 text-xs font-bold opacity-55">— {qa}</p>
          </Card>
        </div>
      </div>

      {/* Tasks preview */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-extrabold">Pending Tasks</h3>
          <Button variant="plain" className="text-xs" onClick={() => go('tasks')}>Manage →</Button>
        </div>
        {up.length === 0 ? (
          <Empty icon={Icon.check} title="Inbox zero!" sub="Every task is done. Time to relax or get ahead." />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {up.map((t) => {
              const sub = smap[t.subjectId]
              const d = t.due ? daysUntil(t.due) : null
              const late = d !== null && d < 0
              return (
                <button
                  key={t.id}
                  onClick={() => { st.toggleTask(t.id); st.party(); st.toast('Task completed! +15 XP 🎉') }}
                  className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-white/25"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 border-white/30 transition group-hover:border-transparent group-hover:bg-emerald-500">
                    <Icon.check className="h-3.5 w-3.5 opacity-0 text-white transition group-hover:opacity-100" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="truncate text-[11px] opacity-55">
                      {sub?.name || 'General'}
                      {t.due && ` · ${late ? `${-d}d overdue` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `in ${d}d`}`}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                    style={{
                      background: hexToRgba(t.priority === 'high' ? '#ef4444' : t.priority === 'medium' ? '#f59e0b' : '#10b981', 0.22),
                      color: t.priority === 'high' ? '#fca5a5' : t.priority === 'medium' ? '#fcd34d' : '#6ee7b7',
                    }}
                  >
                    {t.priority}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
