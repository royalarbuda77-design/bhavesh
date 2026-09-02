import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Card, Button, IconBtn, Icon, Modal, Field, Empty, SectionTitle, Chip } from '../components/ui'
import { subjectMap } from '../stats'
import { PALETTE, hexToRgba } from '../utils'

export default function Notes() {
  const st = useStore()
  const { db } = st
  const smap = useMemo(() => subjectMap(db), [db])
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const [sub, setSub] = useState('all')

  const list = useMemo(() => {
    let l = db.notes.slice()
    if (sub !== 'all') l = l.filter((n) => n.subjectId === sub)
    if (q.trim()) l = l.filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q.toLowerCase()))
    return l.sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt))
  }, [db.notes, q, sub])

  const save = () => {
    const v = { ...editing, title: editing.title.trim() || 'Untitled note' }
    if (v.id) st.updateNote(v.id, v)
    else st.addNote(v)
    setEditing(null)
    st.toast('Note saved 📝')
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Icon.note}
        title="Quick Notes"
        sub={`${db.notes.length} notes · formulas, definitions, reminders`}
        right={<Button variant="primary" icon={Icon.plus} onClick={() => setEditing({ title: '', body: '', subjectId: db.subjects[0]?.id || null, color: PALETTE[db.notes.length % PALETTE.length], pinned: false })}>New Note</Button>}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Icon.search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <input className="inp !py-2 pl-9" placeholder="Search your notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <Chip active={sub === 'all'} onClick={() => setSub('all')}>All</Chip>
            {db.subjects.map((s) => <Chip key={s.id} active={sub === s.id} color={s.color} onClick={() => setSub(s.id)}>{s.name}</Chip>)}
          </div>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card className="p-6"><Empty icon={Icon.note} title="No notes found" sub="Capture formulas, definitions or reminders here." /></Card>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((n) => {
            const s = smap[n.subjectId]
            return (
              <Card key={n.id} hover className="group relative flex min-h-[190px] flex-col overflow-hidden p-5"
                style={{ background: `linear-gradient(160deg, ${hexToRgba(n.color, 0.28)}, ${hexToRgba(n.color, 0.06)})` }}>
                <div className="mb-2 flex items-start gap-2">
                  <p className="min-w-0 flex-1 truncate font-display text-base font-extrabold">{n.pinned && '📌 '}{n.title}</p>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <IconBtn icon={Icon.star} title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => st.updateNote(n.id, { pinned: !n.pinned })} className={n.pinned ? 'text-amber-300' : ''} />
                    <IconBtn icon={Icon.edit} title="Edit" onClick={() => setEditing(n)} />
                    <IconBtn icon={Icon.trash} title="Delete" onClick={() => { st.removeNote(n.id); st.toast('Note deleted') }} />
                  </div>
                </div>
                <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed opacity-80 line-clamp-6">{n.body || 'Empty note…'}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] font-bold">
                  {s ? <span className="rounded-full px-2 py-0.5" style={{ background: hexToRgba(s.color, 0.3), color: s.color }}>{s.name}</span> : <span className="opacity-50">General</span>}
                  <span className="opacity-45">{new Date(n.updatedAt).toLocaleDateString()}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        wide
        title={editing?.id ? 'Edit Note' : 'New Note'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" icon={Icon.check} onClick={save}>Save Note</Button></>}
      >
        {editing && (
          <div className="grid gap-4">
            <Field label="Title"><input autoFocus className="inp" placeholder="Note title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Content"><textarea rows={10} className="inp resize-y font-mono text-[13px]" placeholder="Write anything…" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Subject">
                <select className="inp" value={editing.subjectId || ''} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value || null })}>
                  <option value="">General</option>
                  {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Colour">
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE.map((c) => (
                    <button key={c} onClick={() => setEditing({ ...editing, color: c })}
                      className={`h-8 w-8 rounded-lg transition hover:scale-110 ${editing.color === c ? 'ring-2 ring-white scale-110' : ''}`} style={{ background: c }} />
                  ))}
                </div>
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
