import { DEFAULT_SETTINGS, EMPTY_ANNOTATIONS, type PageFormat, type PageTemplate, type StudyDocument, type StudyPage } from '../types'

export const MAX_FILE_SIZE = 75 * 1024 * 1024
const now = () => Date.now()
export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function pageSize(format: PageFormat) {
  if (format === 'a4-landscape') return { width: 1123, height: 794 }
  if (format === 'screen') return { width: 1280, height: 720 }
  return { width: 794, height: 1123 }
}

export function makeBlankPage(template: PageTemplate = 'white', format: PageFormat = 'a4-portrait', index = 1): StudyPage {
  const size = pageSize(format)
  return {
    id: uid(), name: `Page ${index}`, ...size,
    background: { kind: 'blank', template, color: '#ffffff' },
    annotations: structuredClone(EMPTY_ANNOTATIONS), createdAt: now(), updatedAt: now()
  }
}

export function createBlankDocument(name: string, template: PageTemplate, format: PageFormat): StudyDocument {
  const page = makeBlankPage(template, format)
  return {
    id: uid(), name: name.trim() || 'Untitled board', type: 'blank', pages: [page],
    currentPageId: page.id, zoom: 0, settings: structuredClone(DEFAULT_SETTINGS),
    createdAt: now(), updatedAt: now()
  }
}

export function validateFile(file: File, kind: 'pdf' | 'image') {
  if (file.size > MAX_FILE_SIZE) throw new Error('This file is larger than 75 MB. Please choose a smaller file. / ફાઇલ ખૂબ મોટી છે.')
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (kind === 'pdf' && !(file.type === 'application/pdf' || extension === 'pdf')) {
    throw new Error('Please select a valid PDF file. / માન્ય PDF પસંદ કરો.')
  }
  if (kind === 'image' && !(['png', 'jpg', 'jpeg', 'webp'].includes(extension || '') && ['image/png', 'image/jpeg', 'image/webp', ''].includes(file.type))) {
    throw new Error('Supported images: PNG, JPG, JPEG, WEBP. / સપોર્ટેડ ઈમેજ પસંદ કરો.')
  }
}

export async function createPdfDocument(file: File, onProgress?: (value: string) => void): Promise<StudyDocument> {
  validateFile(file, 'pdf')
  onProgress?.('Reading PDF…')
  let pdf
  try {
    const [pdfjsLib, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ])
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
    pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  } catch {
    throw new Error('This PDF is invalid, corrupted, or password-protected. / PDF ખૂલી શકી નથી.')
  }
  if (pdf.numPages > 300) {
    await pdf.destroy()
    throw new Error('This PDF has more than 300 pages. Split it into smaller files for better mobile performance.')
  }
  const pages: StudyPage[] = []
  for (let index = 0; index < pdf.numPages; index += 1) {
    onProgress?.(`Preparing page ${index + 1} / ${pdf.numPages}…`)
    const sourcePage = await pdf.getPage(index + 1)
    const viewport = sourcePage.getViewport({ scale: 1 })
    const width = 794
    const height = Math.round(width * (viewport.height / viewport.width))
    pages.push({
      id: uid(), name: `Page ${index + 1}`, width, height,
      background: { kind: 'pdf', pdfPageIndex: index },
      annotations: structuredClone(EMPTY_ANNOTATIONS), createdAt: now(), updatedAt: now()
    })
    sourcePage.cleanup()
  }
  await pdf.destroy()
  const page = pages[0]
  return {
    id: uid(), name: file.name.replace(/\.pdf$/i, ''), type: 'pdf', pages,
    originalFile: file, originalFileName: file.name, currentPageId: page.id,
    zoom: 0, settings: structuredClone(DEFAULT_SETTINGS), createdAt: now(), updatedAt: now()
  }
}

async function imageDimensions(blob: Blob) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(blob)
    const value = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return value
  }
  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(blob)
    image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url) }
    image.onerror = () => { reject(new Error('Unable to read image')); URL.revokeObjectURL(url) }
    image.src = url
  })
}

export async function createImageDocument(file: File): Promise<StudyDocument> {
  validateFile(file, 'image')
  let dimensions
  try { dimensions = await imageDimensions(file) } catch { throw new Error('This image is damaged or cannot be read. / ઈમેજ ખૂલી શકી નથી.') }
  const largestSide = Math.max(dimensions.width, dimensions.height)
  const scale = largestSide < 600 ? 600 / largestSide : Math.min(1, 1200 / largestSide)
  const page: StudyPage = {
    id: uid(), name: 'Page 1', width: Math.round(dimensions.width * scale), height: Math.round(dimensions.height * scale),
    background: { kind: 'image', imageBlob: file }, annotations: structuredClone(EMPTY_ANNOTATIONS),
    createdAt: now(), updatedAt: now()
  }
  return {
    id: uid(), name: file.name.replace(/\.[^.]+$/, ''), type: 'image', pages: [page], originalFileName: file.name,
    currentPageId: page.id, zoom: 0, settings: structuredClone(DEFAULT_SETTINGS), createdAt: now(), updatedAt: now()
  }
}

export function duplicatePage(page: StudyPage, index: number): StudyPage {
  return { ...structuredClone(page), id: uid(), name: `${page.name} copy`, createdAt: now(), updatedAt: now() + index }
}
