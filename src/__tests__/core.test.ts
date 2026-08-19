import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBlankDocument, duplicatePage, makeBlankPage, pageSize, validateFile } from '../lib/documents'
import { deleteDocument, getDocument, listDocuments, renameDocument, saveDocument } from '../lib/storage'
import { SnapshotHistory } from '../lib/history'
import { ContinuousPencilBrush } from '../lib/ContinuousPencilBrush'
import { Point, type Canvas } from 'fabric'
import { mapHandPoint, pinchIsActive, smoothHandPoint } from '../lib/handTracking'

describe('document model', () => {
  it('creates mobile-fit editable blank paper models', () => {
    const doc = createBlankDocument('Biology', 'grid', 'a4-portrait')
    expect(doc.name).toBe('Biology')
    expect(doc.zoom).toBe(0)
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0].background).toMatchObject({ kind: 'blank', template: 'grid' })
    expect(doc.pages[0].annotations).toMatchObject({ objects: [] })
    expect(pageSize('a4-landscape')).toEqual({ width: 1123, height: 794 })
  })

  it('duplicates page data independently', () => {
    const page = makeBlankPage('ruled')
    page.annotations = { objects: [{ type: 'Path', id: 'one' }] }
    const copy = duplicatePage(page, 1)
    expect(copy.id).not.toBe(page.id)
    expect(copy.annotations).toEqual(page.annotations)
    ;(copy.annotations.objects as { id: string }[])[0].id = 'two'
    expect((page.annotations.objects as { id: string }[])[0].id).toBe('one')
  })

  it('rejects unsupported and oversized uploads', () => {
    expect(() => validateFile(new File(['x'], 'unsafe.svg', { type: 'image/svg+xml' }), 'image')).toThrow(/Supported images/)
    const fakeHuge = new File(['x'], 'large.pdf', { type: 'application/pdf' })
    Object.defineProperty(fakeHuge, 'size', { value: 76 * 1024 * 1024 })
    expect(() => validateFile(fakeHuge, 'pdf')).toThrow(/larger than 75 MB/)
  })
})

describe('continuous handwriting brush', () => {
  it('preserves every point in loops and always paints source-over', () => {
    const brush = new ContinuousPencilBrush({ contextTop: { globalCompositeOperation: 'source-over' } } as unknown as Canvas)
    const points = [
      new Point(0, 0), new Point(12, 12), new Point(0, 12),
      new Point(12, 0), new Point(0, 0)
    ]
    const retained = brush.decimatePoints(points, 100)
    expect(brush.decimate).toBe(0)
    expect(retained).toEqual(points)
    expect(retained).not.toBe(points)
    expect(brush.convertPointsToSVGPath(retained)).toHaveLength(points.length + 1)

    const path = brush.createPath(brush.convertPointsToSVGPath(retained))
    expect(path.globalCompositeOperation).toBe('source-over')
    expect(path.objectCaching).toBe(false)
    expect(path.strokeLineCap).toBe('round')
    expect(path.strokeLineJoin).toBe('round')
  })
})

describe('HD hand tracking math', () => {
  it('maps mirrored camera coordinates and clamps them to the board', () => {
    expect(mapHandPoint({ x: .2, y: .4 }, { mirror: true, sensitivity: 1, calibrationX: 0, calibrationY: 0 })).toEqual({ x: .8, y: .4 })
    expect(mapHandPoint({ x: 0, y: 1 }, { mirror: false, sensitivity: 1.6, calibrationX: -.2, calibrationY: .2 })).toEqual({ x: 0, y: 1 })
  })

  it('smooths jitter and uses pinch hysteresis', () => {
    const point = smoothHandPoint({ x: .4, y: .4 }, { x: .6, y: .8 }, .5)
    expect(point.x).toBeGreaterThan(.4)
    expect(point.x).toBeLessThan(.6)
    expect(pinchIsActive(.36, false, 1)).toBe(true)
    expect(pinchIsActive(.48, true, 1)).toBe(true)
    expect(pinchIsActive(.6, true, 1)).toBe(false)
  })
})

describe('real undo and redo snapshots', () => {
  it('handles drawing, erasing and redo branches', () => {
    const history = new SnapshotHistory<{ objects: string[] }>()
    history.push({ objects: [] })
    history.push({ objects: ['pen'] })
    history.push({ objects: ['pen', 'shape'] })
    history.push({ objects: ['shape'] })
    expect(history.undo()).toEqual({ objects: ['pen', 'shape'] })
    expect(history.undo()).toEqual({ objects: ['pen'] })
    expect(history.redo()).toEqual({ objects: ['pen', 'shape'] })
    history.push({ objects: ['pen', 'text'] })
    expect(history.canRedo).toBe(false)
  })
})

describe('IndexedDB persistence and reopen flow', () => {
  beforeEach(async () => {
    for (const item of await listDocuments()) await deleteDocument(item.id)
  })

  it('migrates legacy boards to the accurate partial-area eraser once', async () => {
    const legacy = createBlankDocument('Legacy', 'white', 'a4-portrait')
    legacy.settings.eraserMode = 'stroke'
    delete (legacy.settings as Partial<typeof legacy.settings>).eraserAreaV2
    await saveDocument(legacy)
    const reopened = await getDocument(legacy.id)
    expect(reopened?.settings.eraserMode).toBe('area')
    expect(reopened?.settings.eraserAreaV2).toBe(true)
  })

  it('stores editable annotations, blobs, metadata and renamed documents', async () => {
    const doc = createBlankDocument('Physics', 'white', 'screen')
    doc.originalFile = new Blob(['original'], { type: 'application/pdf' })
    doc.pages[0].annotations = { objects: [
      { id: 'stroke-1', type: 'Path', annotationType: 'pen' },
      { id: 'text-1', type: 'IText', annotationType: 'text', text: 'Force' },
      { id: 'shape-1', type: 'Circle', annotationType: 'circle' }
    ] }
    doc.zoom = 1.4
    await saveDocument(doc)

    const reopened = await getDocument(doc.id)
    expect(reopened?.pages[0].annotations).toEqual(doc.pages[0].annotations)
    expect(reopened?.zoom).toBe(1.4)
    // fake-indexeddb/jsdom does not preserve Blob internals; real browsers do.
    expect(reopened).toHaveProperty('originalFile')
    expect(await listDocuments()).toMatchObject([{ id: doc.id, name: 'Physics', pageCount: 1 }])

    await renameDocument(doc.id, 'Mechanics')
    expect((await getDocument(doc.id))?.name).toBe('Mechanics')
    await deleteDocument(doc.id)
    expect(await getDocument(doc.id)).toBeUndefined()
  })
})
