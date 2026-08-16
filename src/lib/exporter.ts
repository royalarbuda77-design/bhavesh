import { PDFDocument, rgb } from 'pdf-lib'
import { StaticCanvas } from 'fabric'
import type { StudyDocument, StudyPage } from '../types'

const MULTIPLIER = 2

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(blob)
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image background')) }
    image.src = url
  })
}

function drawBlankBackground(context: CanvasRenderingContext2D, page: StudyPage, scale: number) {
  const width = page.width * scale
  const height = page.height * scale
  context.fillStyle = page.background.color || '#ffffff'
  context.fillRect(0, 0, width, height)
  const template = page.background.template
  context.lineWidth = scale
  if (template === 'ruled') {
    context.strokeStyle = '#dbe7f5'
    for (let y = 48 * scale; y < height; y += 32 * scale) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
    }
    context.strokeStyle = '#f5b7bd'
    context.beginPath(); context.moveTo(58 * scale, 0); context.lineTo(58 * scale, height); context.stroke()
  } else if (template === 'grid' || template === 'graph') {
    const gap = (template === 'graph' ? 16 : 32) * scale
    context.strokeStyle = template === 'graph' ? '#dce8f8' : '#e3e9f1'
    for (let x = 0; x < width; x += gap) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke() }
    for (let y = 0; y < height; y += gap) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke() }
  }
}

async function annotationCanvas(page: StudyPage, multiplier = MULTIPLIER) {
  const element = document.createElement('canvas')
  const canvas = new StaticCanvas(element, { width: page.width, height: page.height, backgroundColor: 'transparent' })
  await canvas.loadFromJSON(page.annotations)
  canvas.requestRenderAll()
  const rendered = canvas.toCanvasElement(multiplier)
  canvas.dispose()
  return rendered
}

async function composeNonPdfPage(page: StudyPage) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(page.width * MULTIPLIER)
  canvas.height = Math.round(page.height * MULTIPLIER)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas export is not supported by this browser.')
  if (page.background.kind === 'image' && page.background.imageBlob) {
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
    const image = await loadImage(page.background.imageBlob)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
  } else {
    drawBlankBackground(context, page, MULTIPLIER)
  }
  const annotations = await annotationCanvas(page)
  context.drawImage(annotations, 0, 0)
  return canvas
}

async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Unable to create export image.')
  return new Uint8Array(await blob.arrayBuffer())
}

async function annotationPng(page: StudyPage) {
  return canvasPng(await annotationCanvas(page))
}

export async function exportPdf(documentModel: StudyDocument, pages: StudyPage[]) {
  const output = await PDFDocument.create()
  let source: PDFDocument | undefined
  if (documentModel.originalFile) {
    try { source = await PDFDocument.load(await documentModel.originalFile.arrayBuffer(), { ignoreEncryption: false }) }
    catch { throw new Error('The original PDF could not be opened for export.') }
  }

  for (const page of pages) {
    if (page.background.kind === 'pdf' && source) {
      const index = page.background.pdfPageIndex ?? 0
      const [copied] = await output.copyPages(source, [index])
      output.addPage(copied)
      const png = await output.embedPng(await annotationPng(page))
      const size = copied.getSize()
      copied.drawImage(png, { x: 0, y: 0, width: size.width, height: size.height })
    } else {
      const rendered = await composeNonPdfPage(page)
      const png = await output.embedPng(await canvasPng(rendered))
      const pdfPage = output.addPage([page.width * 0.75, page.height * 0.75])
      pdfPage.drawRectangle({ x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight(), color: rgb(1, 1, 1) })
      pdfPage.drawImage(png, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() })
    }
  }
  return new Blob([await output.save()], { type: 'application/pdf' })
}

export async function exportPageImage(documentModel: StudyDocument, page: StudyPage, pdfBackgroundCanvas?: HTMLCanvasElement | null) {
  let canvas: HTMLCanvasElement
  if (page.background.kind !== 'pdf') {
    canvas = await composeNonPdfPage(page)
  } else {
    if (!pdfBackgroundCanvas) throw new Error('Wait for the PDF page to finish rendering, then try again.')
    canvas = document.createElement('canvas')
    canvas.width = page.width * MULTIPLIER
    canvas.height = page.height * MULTIPLIER
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(pdfBackgroundCanvas, 0, 0, canvas.width, canvas.height)
    context.drawImage(await annotationCanvas(page), 0, 0)
  }
  return new Blob([await canvasPng(canvas)], { type: 'image/png' })
}

function browserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function blobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('Unable to prepare the exported file.'))
    reader.readAsDataURL(blob)
  })
}

export async function downloadBlob(blob: Blob, fileName: string) {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) {
    browserDownload(blob, fileName)
    return
  }

  try {
    const [{ Directory, Filesystem }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share')
    ])
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-')
    const result = await Filesystem.writeFile({
      path: `exports/${Date.now()}-${safeName}`,
      data: await blobAsBase64(blob),
      directory: Directory.Cache,
      recursive: true
    })
    await Share.share({
      title: 'Smart Study Board export',
      text: fileName,
      url: result.uri,
      dialogTitle: 'Save or share your study board'
    })
  } catch (error) {
    throw new Error(error instanceof Error ? `The Android share sheet could not open: ${error.message}` : 'The Android share sheet could not open.')
  }
}
