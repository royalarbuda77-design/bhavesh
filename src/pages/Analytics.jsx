import React, { useMemo } from 'react'
import { useStore } from '../store'
import { Card, Icon, SectionTitle, Bar, Ring, Empty } from '../components/ui'
import { last30, last7, minutesBySubject, totalMinutes, streak, bestStreak, subjectMap, achievements, level, weeklyScheduled } from '../stats'
import { durationLabel, DAYS_SHORT, hexToRgba, todayISO, addDays } from '../utils'

export default function Analytics() {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const m30 = last30(db)
  const w = last7(db)
  const bySub = minutesBySubject(db, 30)
  const total = totalMinutes(db)
  const lv = level(db)
  const ach = achievements(db)
  const maxDay = Math.max(30, ...m30.map((d) => d.minutes))
  const weekTotal = w.reduce((a, b) => a + b.minutes, 0)
  const avg = Math.round(weekTotal / 7)
  const subEntries = Object.entries(bySub).sort((a, b) => b[1] - a[1])
  const subTotal = subEntries.reduce((a, b) => a + b[1], 0) || 1
  const doneTasks = db.tasks.filter((t) => t.done).length

  // heatmap of last 12 weeks
  const heat = useMemo(() => {
    const cells = []
    for (let i = 83; i >= 0; i--) {
      const iso = addDays(todayISO(), -i)
      const mins = db.logs.filter((l) => l.date === iso).reduce((a, b) => a + b.minutes, 0)
      cells.push({ iso, mins })
    }
    return cells
  }, [db.logs])
  const maxHeat = Math.max(30, ...heat.map((h) => h.mins))

  const kpis = [
    { label: 'Total studied', value: durationLabel(total), icon: Icon.clock, g: ['var(--c1)', 'var(--c2)'] },
    { label: 'This week', value: durationLabel(weekTotal), icon: Icon.chart, g: ['#06b6d4', '#3b82f6'] },
    { label: 'Daily average', value: durationLabel(avg), icon: Icon.target, g: ['#10b981', '#84cc16'] },
    { label: 'Current streak', value: `${streak(db)} d`, icon: Icon.fire, g: ['#f97316', '#ef4444'] },
    { label: 'Best streak', value: `${bestStreak(db)} d`, icon: Icon.trophy, g: ['#f59e0b', '#facc15'] },
    { label: 'Tasks done', value: `${doneTasks}`, icon: Icon.check, g: ['#8b5cf6', '#ec4899'] },
  ]

  return (
    <div className="space-y-6">
      <SectionTitle icon={Icon.chart} title="Analytics & Achievements" sub="Every minute you study is tracked here" />

      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} hover className="p-4">
            <span className="mb-2 grid h-10 w-10 place-items-center rounded-2xl text-white" style={{ backgroundImage: `linear-gradient(135deg, ${k.g[0]}, ${k.g[1]})` }}>
              <k.icon className="h-5 w-5" />
            </span>
            <p className="font-display text-xl font-extrabold">{k.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-55">{k.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <h3 className="mb-5 font-display text-xl font-extrabold">Last 30 Days</h3>
          <div className="flex h-52 items-end gap-1">
            {m30.map((d, i) => (
              <div key={d.iso} className="group relative flex-1">
                <div className="w-full rounded-t-md transition-all duration-500 hover:brightness-125"
                  style={{
                    height: `${Math.max(3, (d.minutes / maxDay) * 190)}px`,
                    backgroundImage: 'linear-gradient(180deg, var(--c2), var(--c1))',
                    opacity: i === 29 ? 1 : 0.6,
                  }} />
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-[10px] font-bold opacity-0 transition group-hover:opacity-100">
                  {d.minutes}m
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold opacity-45">
            <span>30 days ago</span><span>Today</span>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl font-extrabold">Weekly Rhythm</h3>
          <div className="space-y-3">
            {w.map((d, i) => {
              const label = DAYS_SHORT[(new Date(d.iso + 'T00:00:00').getDay() + 6) % 7]
              const max = Math.max(30, ...w.map((x) => x.minutes))
              return (
                <div key={d.iso} className="flex items-center gap-3">
                  <span className="w-9 text-[11px] font-bold opacity-60">{label}</span>
                  <div className="flex-1"><Bar value={(d.minutes / max) * 100} color="var(--c3)" height={10} /></div>
                  <span className="w-12 text-right text-[11px] font-bold opacity-70">{d.minutes}m</span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 rounded-2xl bg-white/5 p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-55">Scheduled per week</p>
            <p className="font-display text-2xl font-extrabold grad-text">{durationLabel(weeklyScheduled(db))}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-6">
          <h3 className="mb-5 font-display text-xl font-extrabold">Time by Subject</h3>
          {subEntries.length === 0 ? (
            <Empty icon={Icon.chart} title="No data yet" sub="Log a focus session to see your subject split." />
          ) : (
            <>
              <div className="mb-5 flex h-4 overflow-hidden rounded-full">
                {subEntries.map(([id, v]) => (
                  <div key={id} style={{ width: `${(v / subTotal) * 100}%`, background: smap[id]?.color || '#64748b' }} title={`${smap[id]?.name || 'Other'}: ${v}m`} />
                ))}
              </div>
              <div className="space-y-3">
                {subEntries.map(([id, v]) => (
                  <div key={id} className="flex items-center gap-3">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: smap[id]?.color || '#64748b' }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{smap[id]?.name || 'General'}</span>
                    <span className="text-xs font-bold opacity-60">{durationLabel(v)}</span>
                    <span className="w-10 text-right text-xs font-black" style={{ color: smap[id]?.color }}>{Math.round((v / subTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="flex flex-col items-center justify-center p-6">
          <h3 className="mb-4 self-start font-display text-xl font-extrabold">Level Progress</h3>
          <Ring id="lvl" value={lv.pct} size={170} stroke={15} label={`Lv ${lv.lvl}`} sub={`${lv.xp} XP`} gradient={['var(--c3)', 'var(--c2)']} />
          <p className="mt-4 text-center text-xs opacity-60">
            Earn <b>1 XP</b> per minute studied and <b>15 XP</b> per task completed.<br />
            {Math.max(0, lv.next - lv.xp)} XP until level {lv.lvl + 1}.
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl font-extrabold">Consistency Heatmap</h3>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {heat.map((h) => (
              <div key={h.iso} title={`${h.iso}: ${h.mins}m`}
                className="aspect-square rounded-[3px] transition hover:scale-125"
                style={{
                  background: h.mins ? hexToRgba('#a855f7', 0.2 + 0.8 * Math.min(1, h.mins / maxHeat)) : 'rgba(255,255,255,.07)',
                  backgroundImage: h.mins ? `linear-gradient(135deg, var(--c1), var(--c2))` : undefined,
                  opacity: h.mins ? 0.35 + 0.65 * Math.min(1, h.mins / maxHeat) : 1,
                }} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-1.5 text-[10px] font-bold opacity-55">
            Less
            {[0.15, 0.35, 0.6, 0.85, 1].map((o) => (
              <span key={o} className="h-3 w-3 rounded-[3px]" style={{ backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c2))', opacity: o }} />
            ))}
            More
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="mb-5 font-display text-xl font-extrabold">Achievements <span className="opacity-50">({ach.filter((a) => a.done).length}/{ach.length})</span></h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ach.map((a) => (
            <div key={a.id} className={`rounded-2xl border p-4 text-center transition hover:-translate-y-1 ${a.done ? 'border-white/25' : 'border-white/10 opacity-55'}`}
              style={a.done ? { backgroundImage: 'linear-gradient(150deg, rgba(255,255,255,.14), transparent)' } : undefined}>
              <div className={`text-3xl ${a.done ? 'animate-float' : 'grayscale'}`}>{a.icon}</div>
              <p className="mt-2 font-display text-sm font-extrabold">{a.name}</p>
              <p className="mt-0.5 text-[10px] leading-tight opacity-60">{a.desc}</p>
              <div className="mt-2"><Bar value={a.progress * 100} height={5} color={a.done ? '#10b981' : 'var(--c2)'} /></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
