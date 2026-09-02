import React, { useRef, useState } from 'react'
import { useStore, THEMES } from '../store'
import { Card, Button, Icon, SectionTitle, Field, Chip } from '../components/ui'
import { durationLabel } from '../utils'

const AVATARS = ['🚀', '📚', '🧠', '🦉', '🐯', '🌟', '⚡', '🎓', '🍀', '🔥', '🐼', '🦄']

export default function Settings() {
  const st = useStore()
  const { db } = st
  const s = db.settings
  const fileRef = useRef(null)
  const [importing, setImporting] = useState(false)

  const download = () => {
    const blob = new Blob([st.exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studyflow-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    st.toast('Backup downloaded 💾')
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImporting(true)
    try {
      st.importData(await f.text())
      st.toast('Data imported successfully ✅')
    } catch {
      st.toast('That file could not be read', 'error')
    }
    setImporting(false)
    e.target.value = ''
  }

  const set = (patch) => st.setSettings(patch)
  const setPomo = (patch) => set({ pomodoro: { ...s.pomodoro, ...patch } })

  return (
    <div className="space-y-6">
      <SectionTitle icon={Icon.gear} title="Settings" sub="Make StudyFlow yours — themes, goals and data" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl font-extrabold">Profile</h3>
          <Field label="Your name">
            <input className="inp" value={db.profile.name} onChange={(e) => st.setProfile({ name: e.target.value })} placeholder="Your name" />
          </Field>
          <div className="mt-4">
            <span className="lbl">Avatar</span>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button key={a} onClick={() => st.setProfile({ avatar: a })}
                  className={`grid h-11 w-11 place-items-center rounded-2xl text-xl transition hover:scale-110 ${db.profile.avatar === a ? 'ring-2 ring-white/80 scale-110' : 'bg-white/5'}`}
                  style={db.profile.avatar === a ? { backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c2))' } : undefined}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Appearance */}
        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl font-extrabold">Appearance</h3>
          <span className="lbl">Colour theme</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} onClick={() => { set({ theme: k }); st.toast(`${t.name} theme applied 🎨`) }}
                className={`overflow-hidden rounded-2xl border p-3 text-left transition hover:-translate-y-1 ${s.theme === k ? 'border-white/60' : 'border-white/10'}`}>
                <div className="mb-2 h-10 rounded-xl" style={{ backgroundImage: `linear-gradient(120deg, ${t.c1}, ${t.c2}, ${t.c3})` }} />
                <p className="text-xs font-bold">{t.name}{s.theme === k && ' ✓'}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Chip active={s.dark} onClick={() => set({ dark: true })}>🌙 Dark</Chip>
            <Chip active={!s.dark} onClick={() => set({ dark: false })}>☀️ Light</Chip>
            <Chip active={s.h12} onClick={() => set({ h12: !s.h12 })}>{s.h12 ? '12-hour clock' : '24-hour clock'}</Chip>
            <Chip active={s.sound} onClick={() => set({ sound: !s.sound })}>{s.sound ? '🔔 Sound on' : '🔕 Sound off'}</Chip>
          </div>
        </Card>

        {/* Goals */}
        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl font-extrabold">Study Goals</h3>
          <Field label={`Daily goal: ${durationLabel(s.dailyGoal)}`}>
            <input type="range" min="30" max="720" step="15" value={s.dailyGoal} className="w-full accent-fuchsia-500"
              onChange={(e) => set({ dailyGoal: +e.target.value })} />
          </Field>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={`Timetable starts: ${String(s.dayStart).padStart(2, '0')}:00`}>
              <input type="range" min="0" max="12" value={s.dayStart} className="w-full accent-fuchsia-500" onChange={(e) => set({ dayStart: Math.min(+e.target.value, s.dayEnd - 1) })} />
            </Field>
            <Field label={`Timetable ends: ${String(s.dayEnd).padStart(2, '0')}:00`}>
              <input type="range" min="13" max="23" value={s.dayEnd} className="w-full accent-fuchsia-500" onChange={(e) => set({ dayEnd: Math.max(+e.target.value, s.dayStart + 1) })} />
            </Field>
          </div>
        </Card>

        {/* Pomodoro */}
        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl font-extrabold">Pomodoro Timer</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Focus: ${s.pomodoro.focus} min`}>
              <input type="range" min="5" max="90" step="5" value={s.pomodoro.focus} className="w-full accent-fuchsia-500" onChange={(e) => setPomo({ focus: +e.target.value })} />
            </Field>
            <Field label={`Short break: ${s.pomodoro.short} min`}>
              <input type="range" min="1" max="20" value={s.pomodoro.short} className="w-full accent-fuchsia-500" onChange={(e) => setPomo({ short: +e.target.value })} />
            </Field>
            <Field label={`Long break: ${s.pomodoro.long} min`}>
              <input type="range" min="5" max="45" step="5" value={s.pomodoro.long} className="w-full accent-fuchsia-500" onChange={(e) => setPomo({ long: +e.target.value })} />
            </Field>
            <Field label={`Rounds before long break: ${s.pomodoro.rounds}`}>
              <input type="range" min="2" max="8" value={s.pomodoro.rounds} className="w-full accent-fuchsia-500" onChange={(e) => setPomo({ rounds: +e.target.value })} />
            </Field>
          </div>
        </Card>
      </div>

      {/* Data */}
      <Card className="p-6">
        <h3 className="mb-2 font-display text-xl font-extrabold">Your Data</h3>
        <p className="mb-5 text-sm opacity-65">
          Everything is stored privately in your browser — no account, no server. Export a backup to move it to another device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Icon.down} onClick={download}>Export backup</Button>
          <Button icon={Icon.up} disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Importing…' : 'Import backup'}</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          <Button icon={Icon.reset} onClick={() => { if (confirm('Reset to the colourful demo data? Your current data will be lost.')) { st.resetAll(); st.toast('Demo data restored') } }}>Load demo data</Button>
          <Button variant="danger" icon={Icon.trash} onClick={() => { if (confirm('Delete EVERYTHING and start from a clean slate?')) { st.wipeAll(); st.toast('All data cleared') } }}>Clear all data</Button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[['Subjects', db.subjects.length], ['Blocks', db.sessions.length], ['Tasks', db.tasks.length], ['Exams', db.exams.length], ['Notes', db.notes.length]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/5 p-3 text-center">
              <p className="font-display text-2xl font-extrabold grad-text">{v}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide opacity-55">{l}</p>
            </div>
          ))}
        </div>
      </Card>

      <p className="pb-4 text-center text-xs opacity-40">StudyFlow v1.0 · Made for focused students 💜</p>
    </div>
  )
}
