import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FabricObject } from 'fabric'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, Check, ChevronDown, ChevronLeft, ChevronRight,
  Circle as CircleIcon, Copy, Download, Eraser, FileImage, FileOutput, Focus, Hand, Highlighter,
  ImagePlus, Italic, Layers3, LineChart, Maximize, Menu, Minus, MousePointer2, PenLine, Pencil, Plus,
  Redo2, RotateCcw, Save, Shapes, SlidersHorizontal, Sparkles, Square, TextCursorInput, Trash2,
  Triangle, Underline, Undo2, X, ZoomIn, ZoomOut
} from 'lucide-react'
import BoardCanvas, { type BoardHandle, type SelectionStyle } from './BoardCanvas'
import HandGestureMode from './HandGestureMode'
import { duplicatePage, makeBlankPage, validateFile } from '../lib/documents'
import { saveDocument, storageErrorMessage } from '../lib/storage'
import { clearPdfCache, getPdf } from '../lib/pdf'
import type { PageFormat, PageTemplate, SaveStatus, ShapeKind, StudyDocument, StudyPage, Tool, ToolSettings } from '../types'

interface Props {
  initialDocument: StudyDocument
  dark: boolean
  onToggleDark: () => void
  onExit: () => void
  onError: (message: string) => void
}

type PageSnapshot = { pages: StudyPage[]; currentPageId: string }

const colors = ['#17203b', '#ffffff', '#EF4444', '#2563EB', '#16A34A', '#FADB14', '#F97316', '#7C3AED', '#EC4899']
const widths = [1, 2, 4, 6, 8, 12, 20]
const highlighterColors = ['#FADB14', '#6EE7B7', '#F9A8D4', '#93C5FD', '#FDBA74']

const toolItems: { tool: Tool; label: string; icon: typeof PenLine }[] = [
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'pen', label: 'Pen', icon: PenLine },
  { tool: 'pencil', label: 'Pencil', icon: Pencil },
  { tool: 'highlighter', label: 'Highlight', icon: Highlighter },
  { tool: 'eraser', label: 'Eraser', icon: Eraser },
  { tool: 'text', label: 'Text', icon: TextCursorInput },
  { tool: 'shapes', label: 'Shapes', icon: Shapes },
  { tool: 'arrow', label: 'Arrow', icon: ArrowLeft },
  { tool: 'line', label: 'Line', icon: Minus },
  { tool: 'image', label: 'Image', icon: ImagePlus },
  { tool: 'pan', label: 'Pan', icon: Hand }
]

const shapes: { kind: ShapeKind; label: string; icon: typeof Square }[] = [
  { kind: 'line', label: 'Line', icon: Minus }, { kind: 'arrow', label: 'Arrow', icon: ArrowLeft },
  { kind: 'circle', label: 'Circle', icon: CircleIcon }, { kind: 'ellipse', label: 'Ellipse', icon: CircleIcon },
  { kind: 'rectangle', label: 'Rectangle', icon: Square }, { kind: 'roundedRectangle', label: 'Rounded', icon: Square },
  { kind: 'triangle', label: 'Triangle', icon: Triangle }, { kind: 'polygon', label: 'Polygon', icon: Shapes },
  { kind: 'star', label: 'Star', icon: Sparkles }, { kind: 'freehand', label: 'Free shape', icon: Pencil }
]

function SaveIndicator({ status }: { status: SaveStatus }) {
  return <span className={`save-indicator ${status}`}>
    {status === 'saving' ? <><span className="spinner small" /> Saving…</> : status === 'error' ? 'Unable to save locally' : <><Check size={14} /> Saved</>}
  </span>
}

function ToolSettingsPanel({ tool, settings, onChange, onClose }: {
  tool: Tool; settings: ToolSettings; onChange: (patch: Partial<ToolSettings>) => void; onClose: () => void
}) {
  const colorKey = tool === 'highlighter' ? 'highlighterColor' : 'color'
  const activeColor = settings[colorKey]
  const setColor = (value: string) => {
    const recent = [value, ...settings.recentColors.filter(color => color !== value)].slice(0, 5)
    onChange({ [colorKey]: value, recentColors: recent })
  }
  return <div className="tool-settings surface" role="dialog" aria-label={`${tool} settings`}>
    <div className="settings-head"><strong>{tool === 'shapes' ? 'Shape style' : `${tool[0].toUpperCase()}${tool.slice(1)} settings`}</strong><button className="icon-btn" onClick={onClose} aria-label="Close settings"><X size={18} /></button></div>
    {tool === 'eraser' ? <>
      <div className="segmented"><button className={settings.eraserMode === 'stroke' ? 'active' : ''} onClick={() => onChange({ eraserMode: 'stroke' })}>Stroke</button><button className={settings.eraserMode === 'area' ? 'active' : ''} onClick={() => onChange({ eraserMode: 'area' })}>Area</button></div>
      <label className="range-label">Eraser size <b>{settings.eraserSize}px</b><input type="range" min="8" max="80" value={settings.eraserSize} onChange={event => onChange({ eraserSize: +event.target.value })} /></label>
      <p className="microcopy">Only annotations are erased. Your PDF or image stays safe.</p>
    </> : <>
      <span className="field-label">Colour</span>
      <div className="color-row">
        {(tool === 'highlighter' ? highlighterColors : [...settings.recentColors, ...colors].filter((v, i, a) => a.indexOf(v) === i)).slice(0, 11).map(color => <button key={color} className={`color-swatch ${activeColor === color ? 'active' : ''}`} style={{ background: color }} onClick={() => setColor(color)} aria-label={`Use ${color}`} />)}
        <label className="custom-color" title="Custom colour"><input type="color" value={activeColor.startsWith('#') ? activeColor : '#17203b'} onChange={event => setColor(event.target.value)} /><Sparkles size={15} /></label>
      </div>
      {tool === 'shapes' && <><span className="field-label">Fill</span><div className="color-row"><button className={`no-fill ${settings.fillColor === 'transparent' ? 'active' : ''}`} onClick={() => onChange({ fillColor: 'transparent' })}>None</button>{colors.slice(2).map(color => <button key={color} className={`color-swatch ${settings.fillColor === color ? 'active' : ''}`} style={{ background: color }} onClick={() => onChange({ fillColor: color })} />)}</div></>}
      <span className="field-label">Thickness</span>
      <div className="width-row">{(tool === 'highlighter' ? [12, 20, 28, 36, 48] : widths).map(width => <button key={width} className={(tool === 'highlighter' ? settings.highlighterWidth : settings.strokeWidth) === width ? 'active' : ''} onClick={() => onChange(tool === 'highlighter' ? { highlighterWidth: width } : { strokeWidth: width })}>{width}</button>)}</div>
      <label className="range-label">Opacity <b>{Math.round(settings.opacity * 100)}%</b><input type="range" min="10" max="100" value={settings.opacity * 100} onChange={event => onChange({ opacity: +event.target.value / 100 })} /></label>
    </>}
  </div>
}

function TextStylePanel({ settings, onChange, onClose, title = 'Text style' }: {
  settings: ToolSettings; onChange: (patch: Partial<ToolSettings>) => void; onClose: () => void; title?: string
}) {
  return <div className="tool-settings text-settings surface" role="dialog" aria-label={title}>
    <div className="settings-head"><strong>{title}</strong><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
    <div className="text-controls-row">
      <select value={settings.fontFamily} onChange={event => onChange({ fontFamily: event.target.value })} aria-label="Font family"><option value="Inter, sans-serif">Modern</option><option value="Georgia, serif">Serif</option><option value="'Courier New', monospace">Mono</option><option value="cursive">Handwriting</option></select>
      <label>Size <input type="number" min="8" max="160" value={settings.fontSize} onChange={event => onChange({ fontSize: Math.max(8, Math.min(160, +event.target.value)) })} /></label>
      <button className={settings.bold ? 'active' : ''} onClick={() => onChange({ bold: !settings.bold })} title="Bold"><Bold /></button>
      <button className={settings.italic ? 'active' : ''} onClick={() => onChange({ italic: !settings.italic })} title="Italic"><Italic /></button>
      <button className={settings.underline ? 'active' : ''} onClick={() => onChange({ underline: !settings.underline })} title="Underline"><Underline /></button>
    </div>
    <span className="field-label">Text colour</span><div className="color-row">{colors.map(color => <button key={color} className={`color-swatch ${settings.color === color ? 'active' : ''}`} style={{ background: color }} onClick={() => onChange({ color })} />)}<label className="custom-color"><input type="color" value={settings.color} onChange={event => onChange({ color: event.target.value })} /><Sparkles size={15} /></label></div>
    <div className="text-controls-row compact"><span>Align</span><button className={settings.textAlign === 'left' ? 'active' : ''} onClick={() => onChange({ textAlign: 'left' })}><AlignLeft /></button><button className={settings.textAlign === 'center' ? 'active' : ''} onClick={() => onChange({ textAlign: 'center' })}><AlignCenter /></button><button className={settings.textAlign === 'right' ? 'active' : ''} onClick={() => onChange({ textAlign: 'right' })}><AlignRight /></button><label className="background-check"><input type="checkbox" checked={settings.textBackground !== 'transparent'} onChange={event => onChange({ textBackground: event.target.checked ? '#FFF3B0' : 'transparent' })} /> Background</label></div>
  </div>
}

function SelectionStylePanel({ settings, isText, onChange, onClose }: {
  settings: ToolSettings; isText: boolean; onChange: (style: SelectionStyle, settingsPatch?: Partial<ToolSettings>) => void; onClose: () => void
}) {
  if (isText) return <TextStylePanel title="Selected text style" settings={settings} onClose={onClose} onChange={patch => {
    const style: SelectionStyle = {}
    if (patch.color !== undefined) style.color = patch.color
    if (patch.fontSize !== undefined) style.fontSize = patch.fontSize
    if (patch.fontFamily !== undefined) style.fontFamily = patch.fontFamily
    if (patch.bold !== undefined) style.fontWeight = patch.bold ? 'bold' : 'normal'
    if (patch.italic !== undefined) style.fontStyle = patch.italic ? 'italic' : 'normal'
    if (patch.underline !== undefined) style.underline = patch.underline
    if (patch.textAlign !== undefined) style.textAlign = patch.textAlign
    if (patch.textBackground !== undefined) style.backgroundColor = patch.textBackground
    onChange(style, patch)
  }} />
  return <div className="tool-settings surface" role="dialog" aria-label="Selected object style">
    <div className="settings-head"><strong>Selected object style</strong><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
    <span className="field-label">Border colour</span><div className="color-row">{colors.map(color => <button key={color} className="color-swatch" style={{ background: color }} onClick={() => onChange({ color }, { color })} />)}<label className="custom-color"><input type="color" value={settings.color} onChange={event => onChange({ color: event.target.value }, { color: event.target.value })} /><Sparkles size={15} /></label></div>
    <span className="field-label">Fill colour</span><div className="color-row"><button className="no-fill" onClick={() => onChange({ fill: 'transparent' }, { fillColor: 'transparent' })}>None</button>{colors.slice(2).map(color => <button key={color} className="color-swatch" style={{ background: color }} onClick={() => onChange({ fill: color }, { fillColor: color })} />)}</div>
    <span className="field-label">Border thickness</span><div className="width-row">{widths.map(width => <button key={width} onClick={() => onChange({ strokeWidth: width }, { strokeWidth: width })}>{width}</button>)}</div>
    <label className="range-label">Opacity <b>{Math.round(settings.opacity * 100)}%</b><input type="range" min="10" max="100" value={settings.opacity * 100} onChange={event => onChange({ opacity: +event.target.value / 100 }, { opacity: +event.target.value / 100 })} /></label>
  </div>
}

function TextDialog({ initial = '', settings, onCancel, onSubmit }: {
  initial?: string; settings: ToolSettings; onCancel: () => void; onSubmit: (text: string) => void
}) {
  const [value, setValue] = useState(initial)
  return <div className="modal-backdrop" role="presentation"><form className="modal-card text-dialog" onSubmit={event => { event.preventDefault(); if (value.trim()) onSubmit(value) }}>
    <div className="modal-title"><div><span className="eyebrow">TEXT</span><h2>{initial ? 'Edit text' : 'Add text'}</h2></div><button type="button" className="icon-btn" onClick={onCancel}><X /></button></div>
    <textarea autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder="Type your note…" style={{ fontFamily: settings.fontFamily, fontSize: Math.min(settings.fontSize, 30), color: settings.color }} />
    <div className="modal-actions"><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn primary">{initial ? 'Update' : 'Add to page'}</button></div>
  </form></div>
}

function PageThumbnail({ documentModel, page }: { documentModel: StudyDocument; page: StudyPage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || page.background.kind === 'blank') return
    let cancelled = false
    let objectUrl: string | null = null
    const render = async () => {
      try {
        if (page.background.kind === 'pdf') {
          const pdf = await getPdf(documentModel)
          const source = await pdf.getPage((page.background.pdfPageIndex ?? 0) + 1)
          const natural = source.getViewport({ scale: 1 })
          const viewport = source.getViewport({ scale: 116 / natural.width })
          if (cancelled) return
          canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
          const context = canvas.getContext('2d', { alpha: false })
          if (context) await source.render({ canvasContext: context, viewport }).promise
          source.cleanup()
        } else if (page.background.imageBlob) {
          objectUrl = URL.createObjectURL(page.background.imageBlob)
          const image = new Image()
          image.onload = () => {
            if (cancelled) return
            canvas.width = 116; canvas.height = Math.round(116 * page.height / page.width)
            canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
          }
          image.src = objectUrl
        }
      } catch { /* A failed thumbnail never blocks the real page. */ }
    }
    let observer: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); void render() }
      }, { rootMargin: '120px' })
      observer.observe(canvas)
    } else void render()
    return () => { cancelled = true; observer?.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [documentModel.id, page.id, page.background, page.height, page.width])
  return <canvas ref={canvasRef} className="thumbnail-canvas" aria-hidden="true" />
}

function PagesDrawer({ documentModel, pages, currentId, onSelect, onAdd, onDuplicate, onDelete, onRename, onMove, onClose }: {
  documentModel: StudyDocument; pages: StudyPage[]; currentId: string; onSelect: (id: string) => void; onAdd: () => void; onDuplicate: (id: string) => void;
  onDelete: (id: string) => void; onRename: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onClose: () => void
}) {
  return <aside className="pages-drawer surface" aria-label="Pages">
    <div className="drawer-head"><div><span className="eyebrow">DOCUMENT</span><h3>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</h3></div><button className="icon-btn mobile-only" onClick={onClose}><X /></button></div>
    <div className="page-list">
      {pages.map((page, index) => <div key={page.id} className={`page-item ${page.id === currentId ? 'active' : ''}`}>
        <button className={`page-thumb paper-${page.background.template || 'white'}`} onClick={() => onSelect(page.id)} aria-label={`Open ${page.name}`}><PageThumbnail documentModel={documentModel} page={page} /><span>{index + 1}</span></button>
        <div className="page-meta"><button onClick={() => onSelect(page.id)}><b>{page.name}</b><small>{Math.round(page.width)} × {Math.round(page.height)}</small></button><div className="page-actions"><button onClick={() => onMove(page.id, -1)} disabled={index === 0} title="Move up"><ChevronLeft size={15} /></button><button onClick={() => onMove(page.id, 1)} disabled={index === pages.length - 1} title="Move down"><ChevronRight size={15} /></button><button onClick={() => onRename(page.id)} title="Rename"><Pencil size={14} /></button><button onClick={() => onDuplicate(page.id)} title="Duplicate"><Copy size={14} /></button><button onClick={() => onDelete(page.id)} disabled={pages.length === 1} title="Delete"><Trash2 size={14} /></button></div></div>
      </div>)}
    </div>
    <button className="btn soft full" onClick={onAdd}><Plus size={17} /> Add blank page</button>
  </aside>
}

export default function Editor({ initialDocument, dark, onToggleDark, onExit, onError }: Props) {
  const [documentModel, setDocumentModel] = useState(initialDocument)
  const documentRef = useRef(documentModel)
  const [tool, setTool] = useState<Tool>('pen')
  const [shape, setShape] = useState<ShapeKind>('rectangle')
  const [zoom, setZoomState] = useState(initialDocument.zoom > 0 ? initialDocument.zoom : 1)
  const zoomRef = useRef(zoom)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [pagesOpen, setPagesOpen] = useState(() => window.innerWidth >= 900)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shapeMenu, setShapeMenu] = useState(false)
  const [zoomMenu, setZoomMenu] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  const [moreMenu, setMoreMenu] = useState(false)
  const [smartMode, setSmartMode] = useState(false)
  const [hdEnabled, setHdEnabled] = useState(false)
  const [selected, setSelected] = useState<FabricObject | null>(null)
  const [selectionStyleOpen, setSelectionStyleOpen] = useState(false)
  const [textPoint, setTextPoint] = useState<{ x: number; y: number } | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [historyState, setHistoryState] = useState({ undo: false, redo: false })
  const [exporting, setExporting] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<BoardHandle>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<number>()
  const zoomSaveTimer = useRef<number>()
  const initialRender = useRef(true)
  const initialZoomRender = useRef(true)
  const structuralPast = useRef<PageSnapshot[]>([])
  const structuralFuture = useRef<PageSnapshot[]>([])
  const spacePressed = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinch = useRef<{ distance: number; x: number; y: number } | null>(null)
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const pageIndex = Math.max(0, documentModel.pages.findIndex(page => page.id === documentModel.currentPageId))
  const page = documentModel.pages[pageIndex] || documentModel.pages[0]
  const settings = documentModel.settings
  zoomRef.current = zoom

  const patchDocument = useCallback((updater: (document: StudyDocument) => StudyDocument) => {
    setDocumentModel(() => {
      const next = updater(documentRef.current)
      next.updatedAt = Date.now()
      documentRef.current = next
      return next
    })
    setSaveStatus('saving')
  }, [])

  useEffect(() => () => clearPdfCache(initialDocument.id), [initialDocument.id])

  const updatePageAnnotations = useCallback((annotations: Record<string, unknown>) => {
    patchDocument(previous => ({ ...previous, pages: previous.pages.map(item => item.id === previous.currentPageId ? { ...item, annotations, updatedAt: Date.now() } : item) }))
  }, [patchDocument])

  const updateSettings = (patch: Partial<ToolSettings>) => patchDocument(previous => ({ ...previous, settings: { ...previous.settings, ...patch } }))

  const saveNow = useCallback(async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    const model = { ...documentRef.current, zoom: zoomRef.current, updatedAt: Date.now() }
    const current = boardRef.current?.serialize()
    if (current) model.pages = model.pages.map(item => item.id === model.currentPageId ? { ...item, annotations: current } : item)
    documentRef.current = model
    setSaveStatus('saving')
    try { await saveDocument(model); setSaveStatus('saved') }
    catch (error) { setSaveStatus('error'); onError(storageErrorMessage(error)) }
  }, [onError])

  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void saveNow(), 900)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [documentModel, saveNow])

  useEffect(() => {
    documentRef.current.zoom = zoom
    if (initialZoomRender.current) { initialZoomRender.current = false; return }
    setSaveStatus('saving')
    if (zoomSaveTimer.current) window.clearTimeout(zoomSaveTimer.current)
    zoomSaveTimer.current = window.setTimeout(() => void saveNow(), 900)
    return () => { if (zoomSaveTimer.current) window.clearTimeout(zoomSaveTimer.current) }
  }, [zoom, saveNow])

  useEffect(() => {
    if (initialDocument.zoom > 0) return
    const timer = window.setTimeout(() => {
      const viewport = viewportRef.current
      if (!viewport) return
      setZoomState(Math.max(.2, Math.min(1, (viewport.clientWidth - 36) / page.width, (viewport.clientHeight - 36) / page.height)))
    }, 50)
    return () => window.clearTimeout(timer)
  }, [initialDocument.zoom, page.width, page.height])

  const setZoom = (value: number) => {
    setZoomState(Math.max(.15, Math.min(4, value)))
    setSaveStatus('saving')
  }
  const fit = (mode: 'screen' | 'width' | 'reset') => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (mode === 'reset') setZoom(1)
    else if (mode === 'width') setZoom((viewport.clientWidth - 32) / page.width)
    else setZoom(Math.min((viewport.clientWidth - 32) / page.width, (viewport.clientHeight - 32) / page.height))
    setZoomMenu(false)
  }

  const rememberStructure = () => {
    structuralPast.current.push(structuredClone({ pages: documentRef.current.pages, currentPageId: documentRef.current.currentPageId }))
    if (structuralPast.current.length > 30) structuralPast.current.shift()
    structuralFuture.current = []
  }
  const undo = () => {
    if (boardRef.current?.undo()) return
    const snapshot = structuralPast.current.pop()
    if (!snapshot) return
    structuralFuture.current.push(structuredClone({ pages: documentRef.current.pages, currentPageId: documentRef.current.currentPageId }))
    patchDocument(previous => ({ ...previous, ...snapshot }))
  }
  const redo = () => {
    if (boardRef.current?.redo()) return
    const snapshot = structuralFuture.current.pop()
    if (!snapshot) return
    structuralPast.current.push(structuredClone({ pages: documentRef.current.pages, currentPageId: documentRef.current.currentPageId }))
    patchDocument(previous => ({ ...previous, ...snapshot }))
  }

  const switchPage = (id: string) => {
    if (id === page.id) return
    patchDocument(previous => ({ ...previous, currentPageId: id }))
    setSelected(null)
    if (window.innerWidth < 900) setPagesOpen(false)
  }
  const addPage = () => {
    rememberStructure()
    const newPage = makeBlankPage('white', page.width > page.height ? 'a4-landscape' : 'a4-portrait', documentModel.pages.length + 1)
    patchDocument(previous => ({ ...previous, pages: [...previous.pages, newPage], currentPageId: newPage.id }))
  }
  const copyPage = (id: string) => {
    rememberStructure()
    patchDocument(previous => {
      const index = previous.pages.findIndex(item => item.id === id)
      const copy = duplicatePage(previous.pages[index], index)
      const pages = [...previous.pages]; pages.splice(index + 1, 0, copy)
      return { ...previous, pages, currentPageId: copy.id }
    })
  }
  const deletePage = (id: string) => {
    if (documentModel.pages.length === 1 || !window.confirm('Delete this page? This can be undone.')) return
    rememberStructure()
    patchDocument(previous => {
      const index = previous.pages.findIndex(item => item.id === id)
      const pages = previous.pages.filter(item => item.id !== id)
      const currentPageId = previous.currentPageId === id ? pages[Math.max(0, index - 1)].id : previous.currentPageId
      return { ...previous, pages, currentPageId }
    })
  }
  const renamePage = (id: string) => {
    const current = documentModel.pages.find(item => item.id === id)
    const name = window.prompt('Page name', current?.name || '')?.trim()
    if (!name) return
    rememberStructure(); patchDocument(previous => ({ ...previous, pages: previous.pages.map(item => item.id === id ? { ...item, name } : item) }))
  }
  const movePage = (id: string, direction: -1 | 1) => {
    const index = documentModel.pages.findIndex(item => item.id === id), destination = index + direction
    if (destination < 0 || destination >= documentModel.pages.length) return
    rememberStructure(); patchDocument(previous => { const pages = [...previous.pages]; [pages[index], pages[destination]] = [pages[destination], pages[index]]; return { ...previous, pages } })
  }

  const chooseTool = (next: Tool) => {
    if (next === 'image') { imageInputRef.current?.click(); return }
    if (tool === next && ['pen', 'pencil', 'highlighter', 'eraser', 'shapes'].includes(next)) setSettingsOpen(value => !value)
    else { setTool(next); setSettingsOpen(['pen', 'pencil', 'highlighter', 'eraser'].includes(next)); if (next === 'shapes') setShapeMenu(true) }
    setMoreMenu(false)
  }

  const toggleHdMode = () => {
    const next = !hdEnabled
    if (next && !['pen', 'pencil', 'highlighter', 'eraser', 'shapes', 'arrow', 'line'].includes(tool)) setTool('pen')
    setHdEnabled(next)
    setMoreMenu(false)
  }

  const chooseShape = (kind: ShapeKind) => {
    setShape(kind); setTool(kind === 'arrow' ? 'arrow' : kind === 'line' ? 'line' : 'shapes'); setShapeMenu(false); setSettingsOpen(true)
  }

  const runExport = async (kind: 'all' | 'current' | 'image') => {
    setExportMenu(false); setExporting(kind === 'image' ? 'Creating image…' : 'Building PDF…')
    try {
      await saveNow()
      const { downloadBlob, exportPageImage, exportPdf } = await import('../lib/exporter')
      const model = documentRef.current
      if (kind === 'image') {
        const blob = await exportPageImage(model, page, boardRef.current?.getBackgroundCanvas())
        await downloadBlob(blob, `${model.name}-${pageIndex + 1}.png`)
      } else {
        const blob = await exportPdf(model, kind === 'all' ? model.pages : [page])
        await downloadBlob(blob, `${model.name}${kind === 'current' ? `-page-${pageIndex + 1}` : ''}.pdf`)
      }
    } catch (error) { onError(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed. Please try again.') }
    finally { setExporting(null) }
  }

  const exit = async () => { await saveNow(); onExit() }
  const renameDocument = () => {
    const name = window.prompt('Document name', documentModel.name)?.trim()
    if (name) patchDocument(previous => ({ ...previous, name }))
    setMoreMenu(false)
  }
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { onError('Fullscreen is not available in this browser.') }
    setMoreMenu(false)
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow() }
      else if (event.key === 'Delete' || event.key === 'Backspace') boardRef.current?.deleteSelected()
      else if (event.key === 'Escape') { boardRef.current?.discardSelection(); setTool('select'); setSettingsOpen(false) }
      else if (event.code === 'Space') { event.preventDefault(); spacePressed.current = true }
    }
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') spacePressed.current = false }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup)
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup) }
  })

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId === 9042) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const points = [...pointers.current.values()]
      lastPinch.current = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      event.preventDefault(); event.stopPropagation()
    } else if (tool === 'pan' || spacePressed.current) {
      const viewport = viewportRef.current
      if (viewport) { panStart.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }
    }
  }
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId === 9042) return
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size >= 2 && lastPinch.current) {
      const points = [...pointers.current.values()].slice(0, 2), viewport = viewportRef.current
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      const x = (points[0].x + points[1].x) / 2, y = (points[0].y + points[1].y) / 2
      const ratio = distance / Math.max(1, lastPinch.current.distance)
      if (viewport) { viewport.scrollLeft -= x - lastPinch.current.x; viewport.scrollTop -= y - lastPinch.current.y }
      setZoom(zoomRef.current * ratio)
      lastPinch.current = { distance, x, y }; event.preventDefault(); event.stopPropagation()
    } else if (panStart.current) {
      const viewport = viewportRef.current
      if (viewport) { viewport.scrollLeft = panStart.current.left - (event.clientX - panStart.current.x); viewport.scrollTop = panStart.current.top - (event.clientY - panStart.current.y) }
      event.preventDefault()
    }
  }
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId === 9042) return
    pointers.current.delete(event.pointerId); if (pointers.current.size < 2) lastPinch.current = null; panStart.current = null
    if (saveStatus === 'saving') { documentRef.current.zoom = zoomRef.current }
  }

  const selectionType = (selected as unknown as { annotationType?: string })?.annotationType
  const isText = selectionType === 'text'

  return <main className={`editor ${smartMode ? 'smart-mode' : ''}`}>
    <header className="editor-topbar">
      <div className="topbar-left"><button className="icon-btn" onClick={() => void exit()} aria-label="Back to home"><ChevronLeft /></button><div className="document-title"><b>{documentModel.name}</b><span>{page.name} · {pageIndex + 1} / {documentModel.pages.length}</span></div></div>
      <div className="topbar-actions"><SaveIndicator status={saveStatus} /><button className="top-action" onClick={() => void saveNow()} title="Save"><Save size={19} /><span>Save</span></button><button className="icon-btn" onClick={() => setMoreMenu(value => !value)} aria-label="More"><Menu /></button></div>
      {moreMenu && <div className="menu-popover more-popover surface"><button onClick={toggleHdMode}><Hand /> {hdEnabled ? 'Turn off HD Hand Draw' : 'HD Hand Draw (camera)'}</button><button onClick={() => { setSmartMode(value => !value); setMoreMenu(false) }}><Focus /> {smartMode ? 'Exit Smart Board' : 'Smart Board mode'}</button><button onClick={() => void fullscreen()}><Maximize /> Fullscreen</button><button onClick={renameDocument}><Pencil /> Rename document</button><button onClick={onToggleDark}><Sparkles /> {dark ? 'Light UI' : 'Dark UI'}</button><button onClick={() => { setTool('pan'); setMoreMenu(false) }}><Hand /> Pan / hand tool</button></div>}
    </header>

    <div className={`editor-workspace ${pagesOpen ? 'with-pages' : ''}`}>
      {pagesOpen && <><div className="mobile-drawer-backdrop mobile-only" onClick={() => setPagesOpen(false)} /> <PagesDrawer documentModel={documentModel} pages={documentModel.pages} currentId={page.id} onSelect={switchPage} onAdd={addPage} onDuplicate={copyPage} onDelete={deletePage} onRename={renamePage} onMove={movePage} onClose={() => setPagesOpen(false)} /></>}
      <div ref={viewportRef} className={`board-viewport ${tool === 'pan' ? 'panning' : ''}`} onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp} onPointerCancelCapture={pointerUp}>
        <div className="stage-shell" style={{ width: page.width * zoom, height: page.height * zoom }}>
          <div className="stage-zoom" style={{ transform: `scale(${zoom})`, width: page.width, height: page.height }}>
            <BoardCanvas ref={boardRef} documentModel={documentModel} page={page} tool={tool} shape={shape} settings={settings} onAnnotationsChange={updatePageAnnotations} onSelectionChange={object => { setSelected(object); if (!object) setSelectionStyleOpen(false) }} onTextPoint={setTextPoint} onHistoryChange={(undo, redo) => setHistoryState({ undo, redo })} onError={onError} />
          </div>
        </div>
      </div>
    </div>

    <HandGestureMode
      enabled={hdEnabled}
      tool={tool}
      settings={settings}
      onPointer={(phase, x, y, cursorSize) => boardRef.current?.dispatchVirtualPointer(phase, x, y, cursorSize)}
      onSettingsChange={updateSettings}
      onClose={() => setHdEnabled(false)}
      onError={onError}
    />

    {selected && <div className="selection-bar surface"><span>{isText ? 'Text selected' : `${selectionType || 'Object'} selected`}</span>{isText && <button onClick={() => setEditingText(boardRef.current?.editSelectedText()?.text || '')}><TextCursorInput /> Edit</button>}<button onClick={() => setSelectionStyleOpen(value => !value)}><SlidersHorizontal /> Style</button><button onClick={() => void boardRef.current?.duplicateSelected()}><Copy /> Duplicate</button><button className="danger" onClick={() => boardRef.current?.deleteSelected()}><Trash2 /> Delete</button></div>}

    {settingsOpen && ['pen', 'pencil', 'highlighter', 'eraser', 'shapes', 'arrow', 'line'].includes(tool) && <ToolSettingsPanel tool={['arrow', 'line'].includes(tool) ? 'shapes' : tool} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
    {settingsOpen && tool === 'text' && <TextStylePanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
    {selectionStyleOpen && selected && <SelectionStylePanel settings={settings} isText={isText} onClose={() => setSelectionStyleOpen(false)} onChange={(style, patch) => { boardRef.current?.updateSelected(style); if (patch) updateSettings(patch) }} />}
    {shapeMenu && <div className="shape-menu surface"><div className="settings-head"><b>Choose a shape</b><button className="icon-btn" onClick={() => setShapeMenu(false)}><X size={18} /></button></div><div className="shape-grid">{shapes.map(item => <button key={item.kind} className={shape === item.kind ? 'active' : ''} onClick={() => chooseShape(item.kind)}><item.icon /><span>{item.label}</span></button>)}</div></div>}
    {zoomMenu && <div className="menu-popover zoom-popover surface"><button onClick={() => setZoom(zoom + .15)}><ZoomIn /> Zoom in</button><button onClick={() => setZoom(zoom - .15)}><ZoomOut /> Zoom out</button><button onClick={() => fit('screen')}><Focus /> Fit screen</button><button onClick={() => fit('width')}><LineChart /> Fit width</button><button onClick={() => fit('reset')}><RotateCcw /> Reset 100%</button></div>}
    {exportMenu && <div className="menu-popover export-popover surface"><div className="popover-title"><b>Export</b><small>Your editable board remains unchanged</small></div><button onClick={() => void runExport('all')}><FileOutput /> Export all pages PDF</button><button onClick={() => void runExport('current')}><Download /> Current page PDF</button><button onClick={() => void runExport('image')}><FileImage /> Current page image</button></div>}

    <nav className="floating-toolbar surface" aria-label="Board tools">
      <button className="tool-button pages-tool" onClick={() => setPagesOpen(value => !value)} title="Pages"><Layers3 /><span>Pages</span></button>
      <button className="tool-button" onClick={undo} disabled={!historyState.undo && structuralPast.current.length === 0} title="Undo"><Undo2 /><span>Undo</span></button>
      <button className="tool-button" onClick={redo} disabled={!historyState.redo && structuralFuture.current.length === 0} title="Redo"><Redo2 /><span>Redo</span></button>
      <div className="tool-divider" />
      {toolItems.map(item => <button key={item.tool} className={`tool-button ${tool === item.tool || (item.tool === 'shapes' && ['arrow', 'line'].includes(tool)) ? 'active' : ''}`} onClick={() => chooseTool(item.tool)} title={item.label}><item.icon /><span>{item.label}</span>{item.tool === 'shapes' && <ChevronDown className="mini-chevron" />}</button>)}
      <button className={`tool-button hd-tool-button ${hdEnabled ? 'active' : ''}`} onClick={toggleHdMode} title="HD Hand Gesture Drawing"><span className="hd-tool-icon"><Hand /></span><span>HD Draw</span></button>
      <div className="tool-divider" />
      <button className="tool-button" onClick={() => setZoomMenu(value => !value)} title="Zoom"><ZoomIn /><span>{Math.round(zoom * 100)}%</span></button>
      <button className="tool-button export-tool" onClick={() => setExportMenu(value => !value)} title="Export"><FileOutput /><span>Export</span></button>
    </nav>

    <input ref={imageInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { validateFile(file, 'image'); await boardRef.current?.addImage(file); setTool('select') } catch (error) { onError(error instanceof Error ? error.message : 'This image could not be added.') } event.target.value = '' }} />
    {textPoint && <TextDialog settings={settings} onCancel={() => setTextPoint(null)} onSubmit={text => { boardRef.current?.addText(text, textPoint); setTextPoint(null); setTool('select') }} />}
    {editingText !== null && <TextDialog initial={editingText} settings={settings} onCancel={() => setEditingText(null)} onSubmit={text => { boardRef.current?.setSelectedText(text); setEditingText(null) }} />}
    {exporting && <div className="busy-overlay"><div className="busy-card"><span className="spinner" /><b>{exporting}</b><span>Keeping original pages and annotations together…</span></div></div>}
  </main>
}
