import type { StudyDocument, StudyPage } from '../types'

type PdfProxy = {
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number }
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
    cleanup: () => void
  }>
  destroy: () => Promise<void>
}

const cache = new Map<string, Promise<PdfProxy>>()

async function openPdf(data: ArrayBuffer): Promise<PdfProxy> {
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
  return pdfjsLib.getDocument({ data }).promise as unknown as Promise<PdfProxy>
}

export function getPdf(document: StudyDocument) {
  if (!document.originalFile) throw new Error('Original PDF data is missing.')
  if (!cache.has(document.id)) cache.set(document.id, document.originalFile.arrayBuffer().then(openPdf))
  return cache.get(document.id)!
}

export async function renderPdfBackground(document: StudyDocument, page: StudyPage, canvas: HTMLCanvasElement, quality = 1.35) {
  const pdf = await getPdf(document)
  const source = await pdf.getPage((page.background.pdfPageIndex ?? 0) + 1)
  const natural = source.getViewport({ scale: 1 })
  const scale = (page.width * quality) / natural.width
  const viewport = source.getViewport({ scale })
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  canvas.style.width = `${page.width}px`
  canvas.style.height = `${page.height}px`
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas is unavailable')
  await source.render({ canvasContext: context, viewport }).promise
  source.cleanup()
}

export function clearPdfCache(id?: string) {
  if (id) {
    cache.get(id)?.then(pdf => pdf.destroy()).catch(() => undefined)
    cache.delete(id)
  } else {
    for (const promise of cache.values()) promise.then(pdf => pdf.destroy()).catch(() => undefined)
    cache.clear()
  }
}
