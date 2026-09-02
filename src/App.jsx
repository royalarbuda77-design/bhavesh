import React, { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Icon, Toasts, Confetti, IconBtn } from './components/ui'
import Dashboard from './pages/Dashboard'
import Timetable from './pages/Timetable'
import Tasks from './pages/Tasks'
import Focus from './pages/Focus'
import Subjects from './pages/Subjects'
import Exams from './pages/Exams'
import Notes from './pages/Notes'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import { overdueTasks, upcomingTasks } from './stats'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: Icon.home, C: Dashboard },
  { id: 'timetable', label: 'Timetable', icon: Icon.cal, C: Timetable },
  { id: 'tasks', label: 'Tasks', icon: Icon.check, C: Tasks },
  { id: 'focus', label: 'Focus', icon: Icon.clock, C: Focus },
  { id: 'subjects', label: 'Subjects', icon: Icon.book, C: Subjects },
  { id: 'exams', label: 'Exams', icon: Icon.target, C: Exams },
  { id: 'notes', label: 'Notes', icon: Icon.note, C: Notes },
  { id: 'analytics', label: 'Stats', icon: Icon.chart, C: Analytics },
  { id: 'settings', label: 'Settings', icon: Icon.gear, C: Settings },
]

const MOBILE = ['dashboard', 'timetable', 'tasks', 'focus', 'analytics']

function Shell() {
  const st = useStore()
  const { db } = st
  const [page, setPage] = useState(() => (location.hash || '#dashboard').slice(1))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const h = () => setPage((location.hash || '#dashboard').slice(1))
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const go = (id) => { location.hash = id; setPage(id); setOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const active = NAV.find((n) => n.id === page) || NAV[0]
  const Page = active.C
  const overdue = overdueTasks(db).length
  const openTasks = upcomingTasks(db).length

  const badge = (id) => (id === 'tasks' && openTasks ? openTasks : null)

  return (
    <div className="relative min-h-screen">
      <div className="aurora"><span className="b1" /><span className="b2" /><span className="b3" /></div>

      {/* Sidebar (desktop) */}
      <aside className="no-print fixed left-0 top-0 z-40 hidden h-screen w-[240px] flex-col gap-1 p-4 lg:flex">
        <div className="card mb-3 flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl text-white shadow-lg" style={{ backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c2),var(--c3))' }}>
            📘
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-black leading-none grad-text">StudyFlow</p>
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider opacity-50">Plan · Focus · Achieve</p>
          </div>
        </div>

        <nav className="card flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => {
            const on = n.id === page
            return (
              <button key={n.id} onClick={() => go(n.id)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-bold transition ${on ? 'text-white shadow-lg' : 'opacity-65 hover:bg-white/10 hover:opacity-100'}`}
                style={on ? { backgroundImage: 'linear-gradient(100deg,var(--c1),var(--c2))' } : undefined}>
                <n.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 text-left">{n.label}</span>
                {badge(n.id) && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${overdue ? 'bg-rose-500 text-white' : 'bg-white/20'}`}>{badge(n.id)}</span>
                )}
              </button>
            )
          })}
        </nav>

        <button onClick={() => st.setSettings({ dark: !db.settings.dark })}
          className="card flex items-center justify-center gap-2 p-3 text-xs font-bold transition hover:-translate-y-0.5">
          {db.settings.dark ? <Icon.sun className="h-4 w-4" /> : <Icon.moon className="h-4 w-4" />}
          {db.settings.dark ? 'Light mode' : 'Dark mode'}
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-black/25 px-4 py-3 backdrop-blur-xl lg:hidden">
        <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c2))' }}>📘</span>
        <p className="flex-1 font-display text-lg font-black grad-text">StudyFlow</p>
        <IconBtn icon={db.settings.dark ? Icon.sun : Icon.moon} title="Toggle theme" onClick={() => st.setSettings({ dark: !db.settings.dark })} />
        <IconBtn icon={Icon.menu} title="Menu" onClick={() => setOpen(true)} />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 top-0 h-full w-72 animate-pop rounded-l-3xl rounded-r-none p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg font-black grad-text">Menu</p>
              <IconBtn icon={Icon.x} title="Close" onClick={() => setOpen(false)} />
            </div>
            <div className="space-y-1">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => go(n.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition ${n.id === page ? 'text-white' : 'opacity-70'}`}
                  style={n.id === page ? { backgroundImage: 'linear-gradient(100deg,var(--c1),var(--c2))' } : undefined}>
                  <n.icon className="h-[18px] w-[18px]" />
                  {n.label}
                  {badge(n.id) && <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black">{badge(n.id)}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="relative z-10 px-4 pb-28 pt-5 sm:px-6 lg:ml-[240px] lg:pb-10 lg:pt-8">
        <div key={page} className="mx-auto max-w-[1400px] animate-slideUp">
          <Page go={go} />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 bg-black/40 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-2xl lg:hidden">
        {MOBILE.map((id) => {
          const n = NAV.find((x) => x.id === id)
          const on = n.id === page
          return (
            <button key={id} onClick={() => go(id)} className="relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 transition active:scale-90">
              <span className={`grid h-9 w-9 place-items-center rounded-xl transition ${on ? 'text-white' : 'opacity-55'}`}
                style={on ? { backgroundImage: 'linear-gradient(135deg,var(--c1),var(--c2))' } : undefined}>
                <n.icon className="h-[18px] w-[18px]" />
              </span>
              <span className={`text-[9px] font-bold ${on ? 'opacity-100' : 'opacity-50'}`}>{n.label}</span>
            </button>
          )
        })}
      </nav>

      <Toasts items={st.toasts} onDismiss={st.dismissToast} />
      <Confetti trigger={st.confetti} />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
