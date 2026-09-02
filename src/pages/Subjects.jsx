import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Card, Button, IconBtn, Icon, Modal, Field, Empty, SectionTitle, Bar } from '../components/ui'
import { minutesBySubject, scheduledMinutes, sessionsFor } from '../stats'
import { PALETTE, durationLabel, hexToRgba, DAYS_SHORT } from '../utils'

export default function Subjects() {
  const st = useStore()
  const { db } = st
  const [editing, setEditing] = useState(null)
  const mins = useMemo(() => minutesBySubject(db, 7), [db])

  const weekSlots = (id) =>
    [0, 1, 2, 3, 4, 5, 6].flatMap((d) => sessionsFor(db, d).filter((s) => s.subjectId === id).map((s) => ({ ...s, d })))

  const save = () => {
    if (!editing.name.trim()) return st.toast('Subject needs a name', 'error')
    if (editing.id) st.updateSubject(editing.id, editing)
    else st.addSubject(editing)
    setEditing(null)
    st.toast('Subject saved 📚')
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Icon.book}
        title="My Subjects"
        sub={`${db.subjects.length} subjects · colour-coded across the whole app`}
        right={<Button variant="primary" icon={Icon.plus} onClick={() => setEditing({ name: '', teacher: '', color: PALETTE[db.subjects.length % PALETTE.length], target: 5 })}>Add Subject</Button>}
      />

      {db.subjects.length === 0 ? (
        <Card className="p-6"><Empty icon={Icon.book} title="No subjects yet" sub="Create your first subject to start planning."
          action={<Button variant="primary" icon={Icon.plus} onClick={() => setEditing({ name: '', teacher: '', color: PALETTE[0], target: 5 })}>Add Subject</Button>} /></Card>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {db.subjects.map((s) => {
            const studied = (mins[s.id] || 0) / 60
            const target = s.target || 5
            const pct = Math.min(100, (studied / target) * 100)
            const slots = weekSlots(s.id)
            const sched = slots.reduce((a, x) => a + 1, 0)
            const openTasks = db.tasks.filter((t) => t.subjectId === s.id && !t.done).length
            return (
              <Card key={s.id} hover className="group relative overflow-hidden p-5">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl" style={{ background: s.color }} />
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-black text-white shadow-lg"
                      style={{ backgroundImage: `linear-gradient(135deg, ${s.color}, ${hexToRgba(s.color, 0.55)})` }}>
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-extrabold">{s.name}</p>
                      <p className="truncate text-xs opacity-60">{s.teacher || 'No teacher set'}</p>
                    </div>
                    <div className="flex gap-1.5 opacity-50 transition group-hover:opacity-100">
                      <IconBtn icon={Icon.edit} title="Edit" onClick={() => setEditing(s)} />
                      <IconBtn icon={Icon.trash} title="Delete" onClick={() => { if (confirm(`Delete "${s.name}" and its timetable blocks?`)) { st.removeSubject(s.id); st.toast('Subject removed') } }} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[11px] font-bold">
                      <span className="opacity-60">This week</span>
                      <span>{studied.toFixed(1)}h / {target}h</span>
                    </div>
                    <Bar value={pct} color={s.color} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white/5 py-2">
                      <p className="font-display text-base font-extrabold">{sched}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide opacity-55">Blocks</p>
                    </div>
                    <div className="rounded-xl bg-white/5 py-2">
                      <p className="font-display text-base font-extrabold">{openTasks}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide opacity-55">Tasks</p>
                    </div>
                    <div className="rounded-xl bg-white/5 py-2">
                      <p className="font-display text-base font-extrabold">{durationLabel(mins[s.id] || 0)}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide opacity-55">Studied</p>
                    </div>
                  </div>

                  {slots.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {[...new Set(slots.map((x) => x.d))].sort().map((d) => (
                        <span key={d} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: hexToRgba(s.color, 0.25), color: s.color }}>
                          {DAYS_SHORT[d]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Subject' : 'New Subject'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" icon={Icon.check} onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="grid gap-4">
            <Field label="Subject name"><input autoFocus className="inp" placeholder="e.g. Mathematics" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Teacher (optional)"><input className="inp" placeholder="e.g. Mr. Sharma" value={editing.teacher || ''} onChange={(e) => setEditing({ ...editing, teacher: e.target.value })} /></Field>
            <Field label={`Weekly target: ${editing.target || 5} hours`}>
              <input type="range" min="1" max="30" value={editing.target || 5} className="w-full accent-fuchsia-500"
                onChange={(e) => setEditing({ ...editing, target: +e.target.value })} />
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setEditing({ ...editing, color: c })}
                    className={`h-9 w-9 rounded-xl transition hover:scale-110 ${editing.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent scale-110' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
