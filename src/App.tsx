import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen, CheckCircle2, Clock3, FileImage, FilePlus2, FileText, HardDrive, ImagePlus,
  Moon, MoreVertical, Pencil, Plus, Search, ShieldCheck, Sparkles, Sun, Trash2, Upload, WifiOff, X
} from 'lucide-react'
import { createBlankDocument, createImageDocument, createPdfDocument } from './lib/documents'
import { setNativeTheme } from './lib/native'
import { deleteDocument, getDocument, listDocuments, renameDocument, saveDocument } from './lib/storage'
import type { DocumentMeta, PageFormat, PageTemplate, StudyDocument } from './types'

const Editor = lazy(() => import('./components/Editor'))

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: timestamp < Date.now() - 31536000000 ? 'numeric' : undefined }).format(timestamp)
}

function typeLabel(type: DocumentMeta['type']) {
  return type === 'pdf' ? 'PDF board' : type === 'image' ? 'Image board' : 'Study board'
}

function BlankBoardDialog({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string, template: PageTemplate, format: PageFormat) => void }) {
  const [name, setName] = useState('My Study Board')
  const [template, setTemplate] = useState<PageTemplate>('white')
  const [format, setFormat] = useState<PageFormat>('a4-portrait')
  return <div className="modal-backdrop"><form className="modal-card blank-dialog" onSubmit={event => { event.preventDefault(); onCreate(name, template, format) }}>
    <div className="modal-title"><div><span className="eyebrow">NEW BOARD</span><h2>Choose your paper</h2><p>Start simple—you can add more pages anytime.</p></div><button type="button" className="icon-btn" onClick={onCancel}><X /></button></div>
    <label className="input-label">Board name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} autoFocus /></label>
    <span className="input-label">Background</span>
    <div className="paper-options">
      {([['white', 'Blank white'], ['ruled', 'Ruled paper'], ['grid', 'Grid paper'], ['graph', 'Graph paper']] as [PageTemplate, string][]).map(([value, label]) => <button type="button" key={value} className={template === value ? 'active' : ''} onClick={() => setTemplate(value)}><span className={`paper-preview paper-${value}`} /><b>{label}</b>{template === value && <CheckCircle2 />}</button>)}
    </div>
    <span className="input-label">Page size</span>
    <div className="format-options">{([['a4-portrait', 'A4 Portrait'], ['a4-landscape', 'A4 Landscape'], ['screen', 'Screen / Board']] as [PageFormat, string][]).map(([value, label]) => <button type="button" key={value} className={format === value ? 'active' : ''} onClick={() => setFormat(value)}>{label}</button>)}</div>
    <div className="modal-actions"><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn primary"><Plus /> Create board</button></div>
  </form></div>
}

function Home({ dark, onToggleDark, onOpen, onError }: { dark: boolean; onToggleDark: () => void; onOpen: (document: StudyDocument) => void; onError: (message: string) => void }) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [blankDialog, setBlankDialog] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => listDocuments().then(setDocuments).catch(() => onError('Local documents could not be loaded. Check browser storage permissions.')), [onError])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const create = async (name: string, template: PageTemplate, format: PageFormat) => {
    setBlankDialog(false); setBusy('Creating your board…')
    try { const document = createBlankDocument(name, template, format); await saveDocument(document); onOpen(document) }
    catch (error) { onError(error instanceof Error ? error.message : 'Unable to create board.') }
    finally { setBusy(null) }
  }
  const uploadPdf = async (file?: File) => {
    if (!file) return
    setBusy('Reading PDF…')
    try { const document = await createPdfDocument(file, setBusy); await saveDocument(document); onOpen(document) }
    catch (error) { onError(error instanceof Error ? error.message : 'PDF upload failed.') }
    finally { setBusy(null); if (pdfInput.current) pdfInput.current.value = '' }
  }
  const uploadImage = async (file?: File) => {
    if (!file) return
    setBusy('Preparing image…')
    try { const document = await createImageDocument(file); await saveDocument(document); onOpen(document) }
    catch (error) { onError(error instanceof Error ? error.message : 'Image upload failed.') }
    finally { setBusy(null); if (imageInput.current) imageInput.current.value = '' }
  }
  const open = async (id: string) => {
    setBusy('Opening board…')
    try { const document = await getDocument(id); if (!document) throw new Error('Document was not found.'); onOpen(document) }
    catch (error) { onError(error instanceof Error ? error.message : 'Unable to open document.') }
    finally { setBusy(null) }
  }
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return
    try { await deleteDocument(id); await refresh() } catch { onError('Unable to delete this document.') }
  }
  const rename = async (id: string, oldName: string) => {
    const name = window.prompt('Document name', oldName)?.trim()
    if (!name || name === oldName) return
    try { await renameDocument(id, name); await refresh() } catch { onError('Unable to rename this document.') }
  }
  const filtered = documents.filter(document => document.name.toLowerCase().includes(query.toLowerCase()))

  return <main className="home-shell">
    <header className="home-header">
      <a className="brand" href="#top" aria-label="Smart Study Board home"><span className="brand-mark"><BookOpen /></span><span><b>SMART STUDY</b><strong>BOARD</strong></span></a>
      <div className="home-header-actions">{installPrompt && <button className="btn install-btn" onClick={async () => { await installPrompt.prompt(); if ((await installPrompt.userChoice).outcome === 'accepted') setInstallPrompt(null) }}><Upload /> Install app</button>}<button className="icon-btn theme-button" onClick={onToggleDark} aria-label="Toggle dark mode">{dark ? <Sun /> : <Moon />}</button></div>
    </header>

    <section className="hero" id="top">
      <div className="hero-copy"><div className="privacy-pill"><ShieldCheck /> Private by design · files stay on this device</div><h1>Your notes.<br /><em>Your way.</em></h1><p>Write on PDFs, annotate images, or start with fresh paper. A smooth study board built for your phone.</p></div>
      <div className="quick-actions">
        <button className="quick-card primary-card" onClick={() => setBlankDialog(true)}><span className="quick-icon"><Plus /></span><span><b>New Blank Board</b><small>White, ruled, grid or graph paper</small></span><ChevronRightIcon /></button>
        <button className="quick-card" onClick={() => pdfInput.current?.click()}><span className="quick-icon pdf"><FileText /></span><span><b>Upload PDF</b><small>Read, highlight and annotate every page</small></span><ChevronRightIcon /></button>
        <button className="quick-card" onClick={() => imageInput.current?.click()}><span className="quick-icon image"><ImagePlus /></span><span><b>Upload Image</b><small>PNG, JPG, JPEG or WEBP</small></span><ChevronRightIcon /></button>
        <button className="quick-card library-card" onClick={() => document.getElementById('documents')?.scrollIntoView({ behavior: 'smooth' })}><span className="quick-icon library"><BookOpen /></span><span><b>My Documents</b><small>{documents.length ? `${documents.length} saved locally` : 'Your local study library'}</small></span><ChevronRightIcon /></button>
      </div>
    </section>

    <section className="documents-section" id="documents">
      <div className="section-heading"><div><span className="eyebrow">YOUR LIBRARY</span><h2>My Documents</h2><p>Saved locally and ready when you are.</p></div>{documents.length > 4 && <label className="search-box"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search documents" /></label>}</div>
      {filtered.length ? <div className="document-grid">{filtered.map(document => <article className="document-card" key={document.id}>
        <button className={`document-preview ${document.type}`} onClick={() => void open(document.id)}><span>{document.type === 'pdf' ? <FileText /> : document.type === 'image' ? <FileImage /> : <Pencil />}</span><div className="preview-lines"><i /><i /><i /></div><em>{document.pageCount} {document.pageCount === 1 ? 'page' : 'pages'}</em></button>
        <div className="document-info"><div className="document-name"><div><h3>{document.name}</h3><span>{typeLabel(document.type)}</span></div><div className="card-menu"><button className="icon-btn" aria-label="Document menu"><MoreVertical /></button><div className="card-menu-popover"><button onClick={() => void rename(document.id, document.name)}><Pencil /> Rename</button><button className="danger" onClick={() => void remove(document.id, document.name)}><Trash2 /> Delete</button></div></div></div><div className="document-footer"><span><Clock3 /> {timeAgo(document.updatedAt)}</span><button onClick={() => void open(document.id)}>Open <span>→</span></button></div></div>
      </article>)}</div> : <div className="empty-library"><span><FilePlus2 /></span><h3>{query ? 'No matching documents' : 'Your study space is ready'}</h3><p>{query ? 'Try another search.' : 'Create a board or upload your first PDF. Everything saves automatically on this device.'}</p>{!query && <button className="btn soft" onClick={() => setBlankDialog(true)}><Plus /> Create first board</button>}</div>}
    </section>

    <footer className="home-footer"><div><span className="brand-mark small"><BookOpen /></span><b>Smart Study Board</b></div><span><HardDrive /> Local autosave</span><span><WifiOff /> Works offline after first visit</span></footer>

    <input ref={pdfInput} hidden type="file" accept="application/pdf,.pdf" onChange={event => void uploadPdf(event.target.files?.[0])} />
    <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={event => void uploadImage(event.target.files?.[0])} />
    {blankDialog && <BlankBoardDialog onCancel={() => setBlankDialog(false)} onCreate={(name, template, format) => void create(name, template, format)} />}
    {busy && <div className="busy-overlay"><div className="busy-card"><span className="spinner" /><b>{busy}</b><span>Processed privately in your browser</span></div></div>}
  </main>
}

function ChevronRightIcon() { return <span className="chevron">→</span> }

export default function App() {
  const [document, setDocument] = useState<StudyDocument | null>(null)
  const [dark, setDark] = useState(() => localStorage.getItem('study-board-theme') === 'dark' || (!localStorage.getItem('study-board-theme') && matchMedia('(prefers-color-scheme: dark)').matches))
  const [error, setError] = useState<string | null>(null)
  const toggleDark = () => setDark(value => { localStorage.setItem('study-board-theme', !value ? 'dark' : 'light'); return !value })
  useEffect(() => { documentElementClass(dark); void setNativeTheme(dark) }, [dark])
  const showError = useCallback((message: string) => setError(message), [])

  return <div className={dark ? 'theme-dark' : 'theme-light'}>
    {document ? <Suspense fallback={<div className="busy-overlay"><div className="busy-card"><span className="spinner" /><b>Opening Smart Board…</b><span>Loading the editing tools</span></div></div>}><Editor initialDocument={document} dark={dark} onToggleDark={toggleDark} onExit={() => setDocument(null)} onError={showError} /></Suspense> : <Home dark={dark} onToggleDark={toggleDark} onOpen={setDocument} onError={showError} />}
    {error && <div className="toast error-toast" role="alert"><div><b>Something needs attention</b><span>{error}</span></div><button className="icon-btn" onClick={() => setError(null)}><X /></button></div>}
  </div>
}

function documentElementClass(dark: boolean) {
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', dark)
}
