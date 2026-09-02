import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Card, Button, IconBtn, Icon, Modal, Field, Empty, SectionTitle, Bar } from '../components/ui'
import { subjectMap } from '../stats'
import { todayISO, fmtDate, fmtTime, daysUntil, hexToRgba } from '../utils'

export default function Exams() {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const [editing, setEditing] = useState(null)

  const sorted = db.exams.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const upcoming = sorted.filter((e) => e.date >= todayISO())
  const past = sorted.filter((e) => e.date < todayISO()).reverse()

  const save = () => {
    if (!editing.title.trim()) return st.toast('Exam needs a title', 'error')
    if (!editing.date) return st.toast('Pick an exam date', 'error')
    if (editing.id) st.updateExam(editing.id, editing)
    else st.addExam(editing)
    setEditing(null)
    st.toast('Exam saved 📅')
  }

  const Row = ({ e, dim }) => {
    const sub = smap[e.subjectId]
    const d = daysUntil(e.date)
    const color = sub?.color || '#ef4444'
    const urgency = d <= 3 ? '#ef4444' : d <= 7 ? '#f59e0b' : '#10b981'
    return (
      <Card hover className={`group relative overflow-hidden p-5 ${dim ? 'opacity-55' : ''}`}
        style={{ background: `linear-gradient(105deg, ${hexToRgba(color, 0.18)}, transparent 72%)` }}>
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-white shadow-lg"
            style={{ backgroundImage: `linear-gradient(140deg, ${color}, ${hexToRgba(color, 0.6)})` }}>
            <div className="text-center leading-none">
              <p className="font-display text-xl font-black">{new Date(e.date + 'T00:00:00').getDate()}</p>
              <p className="text-[10px] font-bold uppercase">{new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' })}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-extrabold">{e.title}</p>
            <p className="truncate text-xs opacity-60">{sub?.name || 'General'} · {fmtDate(e.date)} at {fmtTime(e.time, db.settings.h12)}</p>
            {e.syllabus && <p className="mt-1.5 line-clamp-2 text-xs opacity-70">📖 {e.syllabus}</p>}
            {!dim && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[10px] font-bold">
                  <span className="opacity-60">Preparation window</span>
                  <span style={{ color: urgency }}>{d === 0 ? 'TODAY!' : d === 1 ? 'Tomorrow' : `${d} days left`}</span>
                </div>
                <Bar value={Math.max(4, 100 - Math.min(100, (d / 60) * 100))} color={urgency} height={6} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {!dim && (
              <div className="text-right">
                <p className="font-display text-3xl font-black leading-none" style={{ color: urgency }}>{d}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide opacity-55">days</p>
              </div>
            )}
            <div className="flex gap-1.5 opacity-50 transition group-hover:opacity-100">
              <IconBtn icon={Icon.edit} title="Edit" onClick={() => setEditing(e)} />
              <IconBtn icon={Icon.trash} title="Delete" onClick={() => { st.removeExam(e.id); st.toast('Exam removed') }} />
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Icon.target}
        title="Exam Countdown"
        sub={`${upcoming.length} upcoming · stay ahead of every deadline`}
        right={<Button variant="primary" icon={Icon.plus} onClick={() => setEditing({ title: '', subjectId: db.subjects[0]?.id || null, date: todayISO(), time: '09:00', syllabus: '' })}>Add Exam</Button>}
      />

      {upcoming.length === 0 && past.length === 0 ? (
        <Card className="p-6"><Empty icon={Icon.target} title="No exams scheduled" sub="Add exam dates to see live countdowns and prep bars." /></Card>
      ) : (
        <>
          <div className="stagger grid gap-4 lg:grid-cols-2">
            {upcoming.map((e) => <Row key={e.id} e={e} />)}
          </div>
          {past.length > 0 && (
            <>
              <h3 className="pt-2 font-display text-lg font-extrabold opacity-60">Past exams</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                {past.map((e) => <Row key={e.id} e={e} dim />)}
              </div>
            </>
          )}
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Exam' : 'New Exam'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" icon={Icon.check} onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="grid gap-4">
            <Field label="Exam title"><input autoFocus className="inp" placeholder="e.g. Mid-term Mathematics" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Subject">
              <select className="inp" value={editing.subjectId || ''} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value || null })}>
                <option value="">General</option>
                {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className="inp" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></Field>
              <Field label="Time"><input type="time" className="inp" value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} /></Field>
            </div>
            <Field label="Syllabus / chapters"><textarea rows={3} className="inp resize-none" placeholder="e.g. Chapters 1–6, all formulas" value={editing.syllabus} onChange={(e) => setEditing({ ...editing, syllabus: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
