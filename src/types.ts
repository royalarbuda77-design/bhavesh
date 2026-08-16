export type DocumentType = 'blank' | 'pdf' | 'image'
export type PageTemplate = 'white' | 'ruled' | 'grid' | 'graph'
export type PageFormat = 'a4-portrait' | 'a4-landscape' | 'screen'
export type Tool = 'select' | 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'text' | 'shapes' | 'arrow' | 'line' | 'image' | 'pan' | 'laser'
export type ShapeKind = 'line' | 'arrow' | 'circle' | 'ellipse' | 'rectangle' | 'roundedRectangle' | 'triangle' | 'polygon' | 'star' | 'freehand'

export interface PageBackground {
  kind: 'blank' | 'pdf' | 'image'
  template?: PageTemplate
  color?: string
  pdfPageIndex?: number
  imageBlob?: Blob
}

export interface StudyPage {
  id: string
  name: string
  width: number
  height: number
  background: PageBackground
  annotations: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface ToolSettings {
  color: string
  strokeWidth: number
  opacity: number
  fillColor: string
  highlighterColor: string
  highlighterWidth: number
  eraserSize: number
  eraserMode: 'stroke' | 'area'
  fontSize: number
  fontFamily: string
  bold: boolean
  italic: boolean
  underline: boolean
  textBackground: string
  textAlign: 'left' | 'center' | 'right'
  recentColors: string[]
}

export interface StudyDocument {
  id: string
  name: string
  type: DocumentType
  pages: StudyPage[]
  originalFile?: Blob
  originalFileName?: string
  currentPageId: string
  zoom: number
  settings: ToolSettings
  createdAt: number
  updatedAt: number
}

export interface DocumentMeta {
  id: string
  name: string
  type: DocumentType
  pageCount: number
  updatedAt: number
  createdAt: number
}

export type SaveStatus = 'saved' | 'saving' | 'error'

export const EMPTY_ANNOTATIONS = { version: '6.7.1', objects: [] }

export const DEFAULT_SETTINGS: ToolSettings = {
  color: '#17203b',
  strokeWidth: 4,
  opacity: 1,
  fillColor: 'transparent',
  highlighterColor: '#FADB14',
  highlighterWidth: 20,
  eraserSize: 28,
  eraserMode: 'stroke',
  fontSize: 28,
  fontFamily: 'Inter, sans-serif',
  bold: false,
  italic: false,
  underline: false,
  textBackground: 'transparent',
  textAlign: 'left',
  recentColors: ['#17203b', '#EF4444', '#2563EB']
}
