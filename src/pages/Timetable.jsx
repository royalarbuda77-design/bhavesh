import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Card, Button, IconBtn, Icon, Modal, Field, Empty, SectionTitle, Chip } from '../components/ui'
import { subjectMap, sessionsFor, scheduledMinutes } from '../stats'
import { DAYS, DAYS_SHORT, dayIndex, fmtTime, toMin, durationLabel, hexToRgba } from '../utils'

const blank = (day) => ({ subjectId: '', day, start: '09:00', end: '10:00', room: '', note: '' })

export default function Timetable() {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const [view, setView] = useState('grid')
  const [day, setDay] = useState(dayIndex())
  const [editing, setEditing] = useState(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFrom, setCopyFrom] = useState(0)
  const [copyTo, setCopyTo] = useState(1)

  const startH = db.settings.dayStart ?? 7
  const endH = db.settings.dayEnd ?? 22
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i)
  const PXH = 62

  const openNew = (d, hour) => {
    const s = blank(d ?? day)
    if (hour != null) {
      s.start = `${String(hour).padStart(2, '0')}:00`
      s.end = `${String(Math.min(23, hour + 1)).padStart(2, '0')}:00`
    }
    s.subjectId = db.subjects[0]?.id || ''
    setEditing(s)
  }

  const save = () => {
    const e = editing
    if (!e.subjectId) return st.toast('Pick a subject first', 'error')
    if (toMin(e.end) <= toMin(e.start)) return st.toast('End time must be after start time', 'error')
    if (e.id) { st.updateSession(e.id, e); st.toast('Session updated ✏️') }
    else { st.addSession(e); st.toast('Session added to timetable ✨') }
    setEditing(null)
  }

  const weekTotal = [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + scheduledMinutes(db, d), 0)

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Icon.cal}
        title="Weekly Timetable"
        sub={`${db.sessions.length} blocks · ${durationLabel(weekTotal)} scheduled this week`}
        right={
          <div className="no-print flex flex-wrap gap-2">
            <div className="glass flex rounded-2xl p-1">
              {['grid', 'list'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold capitalize transition ${view === v ? 'text-white shadow' : 'opacity-60 hover:opacity-100'}`}
                  style={view === v ? { backgroundImage: 'linear-gradient(100deg,var(--c1),var(--c2))' } : undefined}
                >
                  {v}
                </button>
              ))}
            </div>
            <IconBtn icon={Icon.copy} title="Copy a day" onClick={() => setCopyOpen(true)} />
            <IconBtn icon={Icon.print} title="Print timetable" onClick={() => window.print()} />
            <Button variant="primary" icon={Icon.plus} onClick={() => openNew()}>Add Block</Button>
          </div>
        }
      />

      {db.subjects.length === 0 && (
        <Card className="p-6">
          <Empty icon={Icon.book} title="Add subjects first" sub="Head to the Subjects tab to create your subjects, then build your timetable." />
        </Card>
      )}

      {view === 'grid' ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* header */}
              <div className="sticky top-0 z-10 grid border-b border-white/10 bg-black/20 backdrop-blur-xl" style={{ gridTemplateColumns: '68px repeat(7, minmax(0,1fr))' }}>
                <div />
                {DAYS.map((d, i) => (
                  <div key={d} className={`px-2 py-3 text-center ${i === dayIndex() ? '' : 'opacity-70'}`}>
                    <p className="font-display text-sm font-extrabold">{DAYS_SHORT[i]}</p>
                    <p className="text-[10px] opacity-60">{durationLabel(scheduledMinutes(db, i))}</p>
                    {i === dayIndex() && <div className="mx-auto mt-1 h-1 w-8 rounded-full" style={{ backgroundImage: 'linear-gradient(90deg,var(--c1),var(--c2))' }} />}
                  </div>
                ))}
              </div>

              {/* body */}
              <div className="relative grid" style={{ gridTemplateColumns: '68px repeat(7, minmax(0,1fr))' }}>
                {/* hour labels */}
                <div className="relative" style={{ height: hours.length * PXH }}>
                  {hours.map((h, i) => (
                    <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] font-bold opacity-45" style={{ top: i * PXH }}>
                      {fmtTime(`${String(h).padStart(2, '0')}:00`, db.settings.h12)}
                    </div>
                  ))}
                </div>

                {DAYS.map((_, d) => (
                  <div key={d} className="relative border-l border-white/8" style={{ height: hours.length * PXH }}>
                    {hours.map((h, i) => (
                      <button
                        key={h}
                        onClick={() => openNew(d, h)}
                        title="Click to add a block"
                        className="group absolute left-0 right-0 border-t border-white/[.07] transition hover:bg-white/[.06]"
                        style={{ top: i * PXH, height: PXH }}
                      >
                        <Icon.plus className="mx-auto h-4 w-4 opacity-0 transition group-hover:opacity-40" />
                      </button>
                    ))}
                    {sessionsFor(db, d).map((s) => {
                      const sub = smap[s.subjectId]
                      const color = sub?.color || '#8b5cf6'
                      const top = ((toMin(s.start) - startH * 60) / 60) * PXH
                      const h = Math.max(26, ((toMin(s.end) - toMin(s.start)) / 60) * PXH - 4)
                      if (top < -h) return null
                      return (
                        <button
                          key={s.id}
                          onClick={() => setEditing(s)}
                          className="absolute left-1 right-1 overflow-hidden rounded-xl border p-2 text-left transition hover:z-20 hover:scale-[1.035] hover:shadow-xl"
                          style={{
                            top: Math.max(0, top),
                            height: h,
                            borderColor: hexToRgba(color, 0.55),
                            background: `linear-gradient(150deg, ${hexToRgba(color, 0.85)}, ${hexToRgba(color, 0.45)})`,
                            color: '#fff',
                          }}
                        >
                          <p className="truncate text-[11px] font-extrabold leading-tight drop-shadow">{sub?.name || 'Study'}</p>
                          {h > 40 && <p className="truncate text-[10px] opacity-90">{fmtTime(s.start, db.settings.h12)}–{fmtTime(s.end, db.settings.h12)}</p>}
                          {h > 62 && s.room && <p className="truncate text-[10px] opacity-80">📍 {s.room}</p>}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="no-print -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
            {DAYS.map((d, i) => (
              <Chip key={d} active={day === i} onClick={() => setDay(i)}>
                {DAYS_SHORT[i]} · {sessionsFor(db, i).length}
              </Chip>
            ))}
          </div>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl font-extrabold">{DAYS[day]}</h3>
                <p className="text-xs opacity-60">{durationLabel(scheduledMinutes(db, day))} of study planned</p>
              </div>
              <div className="no-print flex gap-2">
                <Button variant="soft" className="text-xs" icon={Icon.plus} onClick={() => openNew(day)}>Add</Button>
                {sessionsFor(db, day).length > 0 && (
                  <Button variant="soft" className="text-xs" icon={Icon.trash}
                    onClick={() => { if (confirm(`Clear all blocks on ${DAYS[day]}?`)) { st.clearDay(day); st.toast('Day cleared') } }}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {sessionsFor(db, day).length === 0 ? (
              <Empty icon={Icon.cal} title={`No blocks on ${DAYS[day]}`} sub="Add a study session to fill this day."
                action={<Button variant="primary" icon={Icon.plus} onClick={() => openNew(day)}>Add block</Button>} />
            ) : (
              <div className="space-y-2.5">
                {sessionsFor(db, day).map((s) => {
                  const sub = smap[s.subjectId]
                  const color = sub?.color || '#8b5cf6'
                  return (
                    <div key={s.id} className="group flex items-center gap-4 rounded-2xl border border-white/10 p-3.5 transition hover:-translate-y-0.5 hover:border-white/25"
                      style={{ background: `linear-gradient(100deg, ${hexToRgba(color, 0.18)}, transparent 70%)` }}>
                      <div className="w-1.5 self-stretch rounded-full" style={{ background: color }} />
                      <div className="min-w-[84px]">
                        <p className="font-display text-sm font-extrabold">{fmtTime(s.start, db.settings.h12)}</p>
                        <p className="text-[10px] opacity-55">{fmtTime(s.end, db.settings.h12)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{sub?.name || 'Study block'}</p>
                        <p className="truncate text-xs opacity-60">{[s.room, sub?.teacher, s.note].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold sm:block">{durationLabel(toMin(s.end) - toMin(s.start))}</span>
                      <div className="no-print flex gap-1.5 opacity-60 transition group-hover:opacity-100">
                        <IconBtn icon={Icon.copy} title="Duplicate" onClick={() => { st.duplicateSession(s.id); st.toast('Block duplicated') }} />
                        <IconBtn icon={Icon.edit} title="Edit" onClick={() => setEditing(s)} />
                        <IconBtn icon={Icon.trash} title="Delete" onClick={() => { st.removeSession(s.id); st.toast('Block removed') }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Study Block' : 'New Study Block'}
        footer={
          <>
            {editing?.id && (
              <Button variant="danger" icon={Icon.trash} onClick={() => { st.removeSession(editing.id); setEditing(null); st.toast('Block removed') }}>Delete</Button>
            )}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" icon={Icon.check} onClick={save}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4">
            <Field label="Subject">
              <select className="inp" value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}>
                <option value="">— select —</option>
                {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Day">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <Chip key={d} active={editing.day === i} onClick={() => setEditing({ ...editing, day: i })}>{DAYS_SHORT[i]}</Chip>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><input type="time" className="inp" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} /></Field>
              <Field label="End"><input type="time" className="inp" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} /></Field>
            </div>
            <Field label="Room / Location"><input className="inp" placeholder="e.g. Room 101, Library, Home" value={editing.room} onChange={(e) => setEditing({ ...editing, room: e.target.value })} /></Field>
            <Field label="Note"><input className="inp" placeholder="e.g. Bring lab manual" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {/* Copy day modal */}
      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy a Whole Day"
        footer={
          <>
            <Button onClick={() => setCopyOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Icon.copy}
              onClick={() => { st.copyDay(copyFrom, copyTo); setCopyOpen(false); st.toast(`${DAYS[copyFrom]} copied to ${DAYS[copyTo]}`) }}>
              Copy
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm opacity-70">This replaces every block on the target day with the blocks from the source day.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select className="inp" value={copyFrom} onChange={(e) => setCopyFrom(+e.target.value)}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label="To">
            <select className="inp" value={copyTo} onChange={(e) => setCopyTo(+e.target.value)}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
