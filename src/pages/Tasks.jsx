import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Card, Button, IconBtn, Icon, Modal, Field, Empty, SectionTitle, Chip, Bar } from '../components/ui'
import { subjectMap } from '../stats'
import { todayISO, daysUntil, fmtDate, hexToRgba } from '../utils'

const PRIOS = [
  { id: 'high', label: 'High', color: '#ef4444' },
  { id: 'medium', label: 'Medium', color: '#f59e0b' },
  { id: 'low', label: 'Low', color: '#10b981' },
]
const prioColor = (p) => PRIOS.find((x) => x.id === p)?.color || '#64748b'

export default function Tasks() {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const [filter, setFilter] = useState('all')
  const [subFilter, setSubFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('due')
  const [editing, setEditing] = useState(null)
  const [quick, setQuick] = useState('')

  const list = useMemo(() => {
    const t = todayISO()
    let l = db.tasks.slice()
    if (filter === 'open') l = l.filter((x) => !x.done)
    if (filter === 'done') l = l.filter((x) => x.done)
    if (filter === 'today') l = l.filter((x) => !x.done && x.due === t)
    if (filter === 'overdue') l = l.filter((x) => !x.done && x.due && x.due < t)
    if (subFilter !== 'all') l = l.filter((x) => x.subjectId === subFilter)
    if (q.trim()) l = l.filter((x) => (x.title + ' ' + (x.notes || '')).toLowerCase().includes(q.toLowerCase()))
    const order = { high: 0, medium: 1, low: 2 }
    l.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (sort === 'due') return (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99')
      if (sort === 'priority') return order[a.priority] - order[b.priority]
      return b.createdAt - a.createdAt
    })
    return l
  }, [db.tasks, filter, subFilter, q, sort])

  const total = db.tasks.length
  const done = db.tasks.filter((t) => t.done).length
  const pct = total ? (done / total) * 100 : 0

  const addQuick = (e) => {
    e.preventDefault()
    if (!quick.trim()) return
    st.addTask({ title: quick.trim(), due: todayISO(), subjectId: db.subjects[0]?.id || null })
    setQuick('')
    st.toast('Task added 📌')
  }

  const save = () => {
    if (!editing.title.trim()) return st.toast('Give the task a title', 'error')
    if (editing.id) st.updateTask(editing.id, editing)
    else st.addTask(editing)
    setEditing(null)
    st.toast('Task saved ✅')
  }

  const counts = {
    all: db.tasks.length,
    open: db.tasks.filter((t) => !t.done).length,
    today: db.tasks.filter((t) => !t.done && t.due === todayISO()).length,
    overdue: db.tasks.filter((t) => !t.done && t.due && t.due < todayISO()).length,
    done,
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Icon.check}
        title="Tasks & Homework"
        sub={`${counts.open} open · ${done} completed`}
        right={<Button variant="primary" icon={Icon.plus} onClick={() => setEditing({ title: '', subjectId: db.subjects[0]?.id || null, due: todayISO(), priority: 'medium', notes: '', done: false })}>New Task</Button>}
      />

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between text-sm font-bold">
          <span>Overall completion</span>
          <span className="grad-text font-display text-xl">{Math.round(pct)}%</span>
        </div>
        <Bar value={pct} height={12} color="var(--c3)" />

        <form onSubmit={addQuick} className="mt-5 flex gap-2">
          <input className="inp" placeholder="⚡ Quick add a task for today…" value={quick} onChange={(e) => setQuick(e.target.value)} />
          <Button variant="primary" icon={Icon.plus} type="submit">Add</Button>
        </form>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {[['all', 'All'], ['open', 'Open'], ['today', 'Today'], ['overdue', 'Overdue'], ['done', 'Done']].map(([id, label]) => (
            <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>
              {label} <span className="opacity-70">({counts[id]})</span>
            </Chip>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <div className="relative">
              <Icon.search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              <input className="inp !w-52 !py-2 pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="inp !w-auto !py-2" value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
              <option value="all">All subjects</option>
              {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="inp !w-auto !py-2" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="due">Sort: Due date</option>
              <option value="priority">Sort: Priority</option>
              <option value="created">Sort: Newest</option>
            </select>
            {done > 0 && <IconBtn icon={Icon.trash} title="Clear completed" onClick={() => { st.clearDone(); st.toast('Completed tasks cleared') }} />}
          </div>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card className="p-6"><Empty icon={Icon.check} title="No tasks here" sub="Try a different filter, or add a new task to get going." /></Card>
      ) : (
        <div className="stagger grid gap-3 lg:grid-cols-2">
          {list.map((t) => {
            const sub = smap[t.subjectId]
            const d = t.due ? daysUntil(t.due) : null
            const late = !t.done && d !== null && d < 0
            const pc = prioColor(t.priority)
            return (
              <Card key={t.id} hover className={`group flex items-start gap-3.5 p-4 ${t.done ? 'opacity-55' : ''}`}
                style={{ background: `linear-gradient(100deg, ${hexToRgba(sub?.color || pc, 0.14)}, transparent 70%)` }}>
                <button
                  onClick={() => { st.toggleTask(t.id); if (!t.done) { st.party(); st.toast('Nice! Task completed 🎉') } }}
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl border-2 transition active:scale-90 ${
                    t.done ? 'border-transparent bg-emerald-500' : 'border-white/30 hover:border-emerald-400 hover:bg-emerald-500/25'
                  }`}
                >
                  <Icon.check className={`h-4 w-4 text-white transition ${t.done ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`} />
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`font-semibold leading-snug ${t.done ? 'line-through' : ''}`}>{t.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {sub && (
                      <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: hexToRgba(sub.color, 0.25), color: sub.color }}>{sub.name}</span>
                    )}
                    <span className="rounded-full px-2 py-0.5 font-black uppercase" style={{ background: hexToRgba(pc, 0.2), color: pc }}>{t.priority}</span>
                    {t.due && (
                      <span className={`rounded-full px-2 py-0.5 font-bold ${late ? 'bg-rose-500/25 text-rose-300' : 'bg-white/10 opacity-70'}`}>
                        {late ? `${-d}d overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : fmtDate(t.due)}
                      </span>
                    )}
                  </div>
                  {t.notes && <p className="mt-2 whitespace-pre-wrap text-xs opacity-60">{t.notes}</p>}
                </div>

                <div className="flex shrink-0 gap-1.5 opacity-50 transition group-hover:opacity-100">
                  <IconBtn icon={Icon.edit} title="Edit" onClick={() => setEditing(t)} />
                  <IconBtn icon={Icon.trash} title="Delete" onClick={() => { st.removeTask(t.id); st.toast('Task deleted') }} />
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Task' : 'New Task'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" icon={Icon.check} onClick={save}>Save Task</Button></>}
      >
        {editing && (
          <div className="grid gap-4">
            <Field label="Title"><input autoFocus className="inp" placeholder="What needs to be done?" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Subject">
                <select className="inp" value={editing.subjectId || ''} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value || null })}>
                  <option value="">General</option>
                  {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Due date"><input type="date" className="inp" value={editing.due || ''} onChange={(e) => setEditing({ ...editing, due: e.target.value })} /></Field>
            </div>
            <Field label="Priority">
              <div className="flex gap-2">
                {PRIOS.map((p) => (
                  <Chip key={p.id} active={editing.priority === p.id} color={p.color} onClick={() => setEditing({ ...editing, priority: p.id })}>{p.label}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Notes"><textarea rows={3} className="inp resize-none" placeholder="Extra details…" value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
