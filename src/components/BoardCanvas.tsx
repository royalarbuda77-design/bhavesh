import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Canvas, Circle, Ellipse, FabricImage, FabricObject, Group, IText, Line,
  Polygon, Rect, Shadow, Triangle, type TPointerEventInfo
} from 'fabric'
import type { ShapeKind, StudyDocument, StudyPage, Tool, ToolSettings } from '../types'
import { SnapshotHistory } from '../lib/history'
import { renderPdfBackground } from '../lib/pdf'
import { ContinuousPencilBrush } from '../lib/ContinuousPencilBrush'

FabricObject.customProperties = ['annotationType', 'annotationId', 'createdAt', 'updatedAt']

type AnnotationObject = FabricObject & {
  annotationType?: string
  annotationId?: string
  createdAt?: number
  updatedAt?: number
}

export interface SelectionStyle {
  color?: string
  fill?: string
  strokeWidth?: number
  opacity?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: 'normal' | 'italic' | 'oblique'
  underline?: boolean
  textAlign?: string
  backgroundColor?: string
}

export interface BoardHandle {
  serialize: () => Record<string, unknown>
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  deleteSelected: () => boolean
  duplicateSelected: () => Promise<boolean>
  addText: (text: string, point: { x: number; y: number }, style?: Partial<SelectionStyle>) => void
  addImage: (file: File) => Promise<void>
  updateSelected: (style: SelectionStyle) => void
  setSelectedText: (text: string) => void
  editSelectedText: () => { object: IText; text: string } | null
  getBackgroundCanvas: () => HTMLCanvasElement | null
  discardSelection: () => void
}

interface Props {
  documentModel: StudyDocument
  page: StudyPage
  tool: Tool
  shape: ShapeKind
  settings: ToolSettings
  onAnnotationsChange: (annotations: Record<string, unknown>) => void
  onSelectionChange: (object: FabricObject | null) => void
  onTextPoint: (point: { x: number; y: number }) => void
  onHistoryChange: (undo: boolean, redo: boolean) => void
  onError: (message: string) => void
}

const hexToRgba = (color: string, alpha: number) => {
  if (!color.startsWith('#')) return color
  const hex = color.slice(1)
  const expanded = hex.length === 3 ? hex.split('').map(v => v + v).join('') : hex
  const number = Number.parseInt(expanded, 16)
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`
}

const pointsFor = (kind: 'star' | 'polygon', radius = 50) => {
  const points: { x: number; y: number }[] = []
  const count = kind === 'star' ? 10 : 6
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count
    const r = kind === 'star' && i % 2 ? radius * 0.45 : radius
    points.push({ x: Math.cos(angle) * r + radius, y: Math.sin(angle) * r + radius })
  }
  return points
}

const continuousStrokeTypes = new Set(['pen', 'pencil', 'highlighter', 'freehand'])

function preserveContinuousStroke(object: AnnotationObject) {
  if (!continuousStrokeTypes.has(object.annotationType || '')) return
  object.set({
    fill: null,
    globalCompositeOperation: 'source-over',
    objectCaching: false,
    strokeLineCap: 'round',
    strokeLineJoin: 'round'
  })
}

const BoardCanvas = forwardRef<BoardHandle, Props>(function BoardCanvas({
  documentModel, page, tool, shape, settings, onAnnotationsChange, onSelectionChange, onTextPoint, onHistoryChange, onError
}, ref) {
  const canvasElement = useRef<HTMLCanvasElement>(null)
  const eraserPreviewElement = useRef<HTMLDivElement>(null)
  const [canvasReady, setCanvasReady] = useState(0)
  const backgroundElement = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const history = useRef(new SnapshotHistory<Record<string, unknown>>(60))
  const loading = useRef(true)
  const shapeObject = useRef<FabricObject | null>(null)
  const shapeStart = useRef<{ x: number; y: number } | null>(null)
  const currentTool = useRef(tool)
  const currentShape = useRef(shape)
  const currentSettings = useRef(settings)
  const configuredTool = useRef<Tool | null>(null)

  currentTool.current = tool
  currentShape.current = shape
  currentSettings.current = settings

  const serialize = () => (canvasRef.current?.toJSON() || { objects: [] }) as Record<string, unknown>

  const notifyHistory = () => onHistoryChange(history.current.canUndo, history.current.canRedo)
  const commit = () => {
    if (loading.current) return
    const state = serialize()
    history.current.push(state)
    onAnnotationsChange(state)
    notifyHistory()
  }

  const mark = (object: AnnotationObject, annotationType: string) => {
    object.annotationType = annotationType
    object.annotationId ||= crypto.randomUUID()
    object.createdAt ||= Date.now()
    object.updatedAt = Date.now()
    object.set({ cornerColor: '#6c5ce7', borderColor: '#6c5ce7', cornerStyle: 'circle', transparentCorners: false, cornerSize: 18, touchCornerSize: 50 })
    return object
  }

  useEffect(() => {
    const background = backgroundElement.current
    if (!background) return
    let cancelled = false
    const context = background.getContext('2d')
    background.width = page.width
    background.height = page.height
    background.style.width = `${page.width}px`
    background.style.height = `${page.height}px`
    if (page.background.kind === 'pdf') {
      renderPdfBackground(documentModel, page, background).catch(() => {
        if (!cancelled) onError('This PDF page could not be rendered. Try reopening the document.')
      })
    } else if (page.background.kind === 'image' && page.background.imageBlob) {
      const url = URL.createObjectURL(page.background.imageBlob)
      const image = new Image()
      image.onload = () => {
        if (!cancelled && context) {
          context.fillStyle = '#fff'; context.fillRect(0, 0, page.width, page.height)
          context.drawImage(image, 0, 0, page.width, page.height)
        }
        URL.revokeObjectURL(url)
      }
      image.onerror = () => { URL.revokeObjectURL(url); onError('The image background could not be displayed.') }
      image.src = url
    }
    return () => { cancelled = true }
  }, [documentModel.id, page.id, page.width, page.height, page.background, onError])

  useEffect(() => {
    if (!canvasElement.current) return
    const canvas = new Canvas(canvasElement.current, {
      width: page.width, height: page.height, preserveObjectStacking: true,
      selectionColor: 'rgba(108,92,231,.12)', selectionBorderColor: '#6c5ce7', allowTouchScrolling: false
    })
    canvasRef.current = canvas
    loading.current = true
    let disposed = false

    const sendSelection = () => onSelectionChange(canvas.getActiveObject() || null)
    const changed = (event?: { target?: FabricObject }) => {
      if (event?.target) (event.target as AnnotationObject).updatedAt = Date.now()
      commit()
    }
    const pathCreated = (event: { path: FabricObject }) => {
      const isAreaEraser = currentTool.current === 'eraser' && currentSettings.current.eraserMode === 'area'
      const path = mark(event.path as AnnotationObject, isAreaEraser ? 'area-eraser' : currentTool.current === 'shapes' ? 'freehand' : currentTool.current)
      if (isAreaEraser) {
        path.set({ globalCompositeOperation: 'destination-out', selectable: false, evented: false, objectCaching: false })
      } else {
        // Tight loops and self-intersections must always paint over the existing stroke.
        preserveContinuousStroke(path)
      }
      commit()
    }
    canvas.on('selection:created', sendSelection)
    canvas.on('selection:updated', sendSelection)
    canvas.on('selection:cleared', sendSelection)
    canvas.on('object:modified', changed)
    canvas.on('path:created', pathCreated)

    canvas.loadFromJSON(page.annotations).then(() => {
      if (disposed) return
      canvas.getObjects().forEach(object => {
        const annotation = mark(object as AnnotationObject, (object as AnnotationObject).annotationType || 'object')
        preserveContinuousStroke(annotation)
      })
      canvas.renderAll()
      loading.current = false
      const state = serialize()
      history.current.clear(state)
      notifyHistory()
      setCanvasReady(value => value + 1)
    }).catch(() => {
      if (disposed) return
      loading.current = false
      history.current.clear({ objects: [] })
      setCanvasReady(value => value + 1)
      onError('Some annotations could not be restored. The original page is safe.')
    })

    return () => {
      disposed = true
      loading.current = true
      canvas.dispose()
      canvasRef.current = null
      onSelectionChange(null)
    }
    // page id intentionally owns the complete Fabric lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || loading.current) return
    const selectable = tool === 'select'
    const toolChanged = configuredTool.current !== tool
    configuredTool.current = tool
    canvas.isDrawingMode = ['pen', 'pencil', 'highlighter'].includes(tool) || (tool === 'shapes' && shape === 'freehand') || (tool === 'eraser' && settings.eraserMode === 'area')
    canvas.selection = selectable
    canvas.skipTargetFind = !(selectable || (tool === 'eraser' && settings.eraserMode === 'stroke'))
    const cursor = tool === 'eraser' ? 'none' : tool === 'pan' ? 'grab' : selectable ? 'default' : 'crosshair'
    canvas.defaultCursor = cursor
    canvas.hoverCursor = cursor
    canvas.freeDrawingCursor = cursor
    canvas.upperCanvasEl.style.cursor = cursor
    if (tool !== 'eraser') eraserPreviewElement.current?.classList.remove('visible')
    canvas.getObjects().forEach(object => {
      const isEraserMask = (object as AnnotationObject).annotationType === 'area-eraser'
      object.set({ selectable: selectable && !isEraserMask, evented: !isEraserMask && (selectable || (tool === 'eraser' && settings.eraserMode === 'stroke')) })
    })
    if (toolChanged) {
      canvas.discardActiveObject()
      onSelectionChange(null)
    }
    canvas.requestRenderAll()

    if (canvas.isDrawingMode) {
      const brush = new ContinuousPencilBrush(canvas)
      // Explicitly preserve every point; this prevents loops from changing on pointer-up.
      brush.decimate = 0
      canvas.contextTop.globalCompositeOperation = 'source-over'
      if (tool === 'eraser') {
        brush.color = '#000000'
        brush.width = settings.eraserSize
      } else if (tool === 'highlighter') {
        brush.color = hexToRgba(settings.highlighterColor, 0.34)
        brush.width = settings.highlighterWidth
      } else if (tool === 'pencil') {
        brush.color = hexToRgba(settings.color, settings.opacity * 0.72)
        brush.width = Math.max(1, settings.strokeWidth * 0.72)
        brush.shadow = new Shadow({ color: hexToRgba(settings.color, 0.15), blur: 0.5 })
      } else {
        brush.color = hexToRgba(settings.color, settings.opacity)
        brush.width = settings.strokeWidth
      }
      brush.limitedToCanvasSize = true
      canvas.freeDrawingBrush = brush
    }
  }, [tool, shape, settings.color, settings.opacity, settings.strokeWidth, settings.highlighterColor, settings.highlighterWidth, settings.eraserMode, settings.eraserSize, canvasReady, onSelectionChange])

  useEffect(() => {
    const canvas = canvasRef.current
    const indicator = eraserPreviewElement.current
    if (!canvas || !indicator) return

    const showIndicator = (event: TPointerEventInfo, active = false) => {
      if (currentTool.current !== 'eraser') return
      const point = canvas.getScenePoint(event.e)
      indicator.style.left = `${point.x}px`
      indicator.style.top = `${point.y}px`
      indicator.classList.add('visible')
      indicator.classList.toggle('active', active)
    }
    const move = (event: TPointerEventInfo) => showIndicator(event, indicator.classList.contains('active'))
    const down = (event: TPointerEventInfo) => showIndicator(event, true)
    const up = (event: TPointerEventInfo) => {
      showIndicator(event, false)
      const nativeEvent = event.e as Event & { pointerType?: string }
      if (nativeEvent.pointerType === 'touch' || nativeEvent.type.startsWith('touch')) indicator.classList.remove('visible')
    }
    const hide = () => indicator.classList.remove('visible', 'active')

    canvas.on('mouse:move', move)
    canvas.on('mouse:down', down)
    canvas.on('mouse:up', up)
    canvas.on('mouse:out', hide)
    return () => {
      hide()
      canvas.off('mouse:move', move)
      canvas.off('mouse:down', down)
      canvas.off('mouse:up', up)
      canvas.off('mouse:out', hide)
    }
  }, [page.id, canvasReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let erasing = false

    const style = () => ({
      fill: currentSettings.current.fillColor,
      stroke: currentSettings.current.color,
      strokeWidth: currentSettings.current.strokeWidth,
      opacity: currentSettings.current.opacity,
      strokeUniform: true
    })
    const makeShape = (kind: ShapeKind, x: number, y: number): FabricObject => {
      const common = { left: x, top: y, ...style() }
      if (kind === 'line') return new Line([x, y, x + 1, y + 1], { ...style(), fill: undefined })
      if (kind === 'circle') return new Circle({ ...common, radius: 1, originX: 'left', originY: 'top' })
      if (kind === 'ellipse') return new Ellipse({ ...common, rx: 1, ry: 1, originX: 'left', originY: 'top' })
      if (kind === 'triangle') return new Triangle({ ...common, width: 1, height: 1 })
      if (kind === 'polygon') return new Polygon(pointsFor('polygon'), { ...common, scaleX: .01, scaleY: .01 })
      if (kind === 'star') return new Polygon(pointsFor('star'), { ...common, scaleX: .01, scaleY: .01 })
      if (kind === 'arrow') {
        const shaft = new Rect({ left: 0, top: 18, width: 55, height: 14, fill: currentSettings.current.color, strokeWidth: 0 })
        const head = new Triangle({ left: 48, top: 0, width: 42, height: 50, angle: 90, fill: currentSettings.current.color, strokeWidth: 0 })
        return new Group([shaft, head], { ...common, width: 90, height: 50, scaleX: .01, scaleY: .01 })
      }
      return new Rect({ ...common, width: 1, height: 1, rx: kind === 'roundedRectangle' ? 18 : 0, ry: kind === 'roundedRectangle' ? 18 : 0 })
    }
    const eraseAt = (event: TPointerEventInfo) => {
      const point = canvas.getScenePoint(event.e)
      const radius = currentSettings.current.eraserSize / 2
      const objects = canvas.getObjects().filter(object => {
        if (currentSettings.current.eraserMode === 'stroke') return event.target === object
        const rect = object.getBoundingRect()
        return point.x + radius >= rect.left && point.x - radius <= rect.left + rect.width && point.y + radius >= rect.top && point.y - radius <= rect.top + rect.height
      })
      if (objects.length) {
        objects.forEach(object => canvas.remove(object))
        canvas.requestRenderAll()
        commit()
      }
    }
    const down = (event: TPointerEventInfo) => {
      const activeTool = currentTool.current
      if (activeTool === 'eraser') {
        if (currentSettings.current.eraserMode === 'stroke') { erasing = true; eraseAt(event) }
        return
      }
      if (activeTool === 'text') { onTextPoint(canvas.getScenePoint(event.e)); return }
      const kind = activeTool === 'arrow' ? 'arrow' : activeTool === 'line' ? 'line' : currentShape.current
      if (!['shapes', 'arrow', 'line'].includes(activeTool) || kind === 'freehand') return
      const point = canvas.getScenePoint(event.e)
      shapeStart.current = point
      shapeObject.current = mark(makeShape(kind, point.x, point.y) as AnnotationObject, kind)
      canvas.add(shapeObject.current)
    }
    const move = (event: TPointerEventInfo) => {
      if (erasing) { eraseAt(event); return }
      const object = shapeObject.current
      const start = shapeStart.current
      if (!object || !start) return
      const point = canvas.getScenePoint(event.e)
      const left = Math.min(start.x, point.x), top = Math.min(start.y, point.y)
      const width = Math.max(2, Math.abs(point.x - start.x)), height = Math.max(2, Math.abs(point.y - start.y))
      if (object instanceof Line) object.set({ x1: start.x, y1: start.y, x2: point.x, y2: point.y })
      else if (object instanceof Circle) object.set({ left, top, radius: Math.max(width, height) / 2, scaleX: width / Math.max(width, height), scaleY: height / Math.max(width, height) })
      else if (object instanceof Ellipse) object.set({ left, top, rx: width / 2, ry: height / 2 })
      else if (object instanceof Polygon || object instanceof Group) object.set({ left, top, scaleX: width / Math.max(1, object.width), scaleY: height / Math.max(1, object.height) })
      else object.set({ left, top, width, height })
      object.setCoords(); canvas.requestRenderAll()
    }
    const up = () => {
      erasing = false
      if (shapeObject.current) {
        shapeObject.current.set({ selectable: false, evented: false })
        shapeObject.current.setCoords()
        shapeObject.current = null; shapeStart.current = null
        commit()
      }
    }
    canvas.on('mouse:down', down); canvas.on('mouse:move', move); canvas.on('mouse:up', up)
    return () => { canvas.off('mouse:down', down); canvas.off('mouse:move', move); canvas.off('mouse:up', up) }
  }, [page.id, onTextPoint])

  async function loadHistoryState(state: Record<string, unknown>) {
    const canvas = canvasRef.current
    if (!canvas) return false
    loading.current = true
    await canvas.loadFromJSON(state)
    canvas.getObjects().forEach(object => {
      const annotation = object as AnnotationObject
      const isEraserMask = annotation.annotationType === 'area-eraser'
      preserveContinuousStroke(annotation)
      object.set({ selectable: currentTool.current === 'select' && !isEraserMask, evented: !isEraserMask && (currentTool.current === 'select' || (currentTool.current === 'eraser' && currentSettings.current.eraserMode === 'stroke')) })
    })
    canvas.requestRenderAll(); loading.current = false
    onAnnotationsChange(state); onSelectionChange(null); notifyHistory()
    return true
  }

  useImperativeHandle(ref, () => ({
    serialize,
    canUndo: () => history.current.canUndo,
    canRedo: () => history.current.canRedo,
    undo: () => { const state = history.current.undo(); if (!state) return false; void loadHistoryState(state); return true },
    redo: () => { const state = history.current.redo(); if (!state) return false; void loadHistoryState(state); return true },
    deleteSelected: () => {
      const canvas = canvasRef.current, active = canvas?.getActiveObjects() || []
      if (!canvas || !active.length) return false
      active.forEach(object => canvas.remove(object)); canvas.discardActiveObject(); canvas.requestRenderAll(); commit(); onSelectionChange(null); return true
    },
    duplicateSelected: async () => {
      const canvas = canvasRef.current, active = canvas?.getActiveObject()
      if (!canvas || !active) return false
      const clone = await active.clone(['annotationType', 'annotationId', 'createdAt', 'updatedAt']) as AnnotationObject
      clone.set({ left: (active.left || 0) + 24, top: (active.top || 0) + 24 })
      clone.annotationId = crypto.randomUUID(); clone.createdAt = Date.now(); clone.updatedAt = Date.now()
      canvas.add(clone); canvas.setActiveObject(clone); canvas.requestRenderAll(); commit(); onSelectionChange(clone); return true
    },
    addText: (text, point, override = {}) => {
      const canvas = canvasRef.current
      if (!canvas || !text.trim()) return
      const object = mark(new IText(text.trim(), {
        left: point.x, top: point.y, fill: override.color || settings.color,
        fontSize: override.fontSize || settings.fontSize, fontFamily: override.fontFamily || settings.fontFamily,
        fontWeight: override.fontWeight || (settings.bold ? 'bold' : 'normal'), fontStyle: override.fontStyle || (settings.italic ? 'italic' : 'normal'),
        underline: override.underline ?? settings.underline, backgroundColor: override.backgroundColor || settings.textBackground,
        textAlign: (override.textAlign || settings.textAlign) as 'left' | 'center' | 'right', opacity: settings.opacity
      }) as AnnotationObject, 'text')
      canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); commit(); onSelectionChange(object)
    },
    addImage: async file => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Unable to read image'))
        reader.readAsDataURL(file)
      })
      const image = await FabricImage.fromURL(dataUrl) as AnnotationObject
      const max = Math.min(page.width * .6 / (image.width || 1), page.height * .6 / (image.height || 1), 1)
      image.set({ left: page.width * .2, top: page.height * .2, scaleX: max, scaleY: max })
      mark(image, 'image'); canvas.add(image); canvas.setActiveObject(image); canvas.requestRenderAll(); commit(); onSelectionChange(image)
    },
    updateSelected: style => {
      const canvas = canvasRef.current, object = canvas?.getActiveObject() as AnnotationObject | undefined
      if (!canvas || !object) return
      const patch: Record<string, unknown> = {}
      if (style.color !== undefined) { patch.stroke = style.color; if (object.annotationType === 'text' || object.annotationType === 'arrow') patch.fill = style.color }
      if (style.fill !== undefined) patch.fill = style.fill
      if (style.strokeWidth !== undefined) patch.strokeWidth = style.strokeWidth
      if (style.opacity !== undefined) patch.opacity = style.opacity
      for (const key of ['fontSize','fontFamily','fontWeight','fontStyle','underline','textAlign','backgroundColor'] as const) if (style[key] !== undefined) patch[key] = style[key]
      object.set(patch)
      if (object instanceof Group && (object as AnnotationObject).annotationType === 'arrow' && (style.color !== undefined || style.fill !== undefined)) {
        object.getObjects().forEach(child => child.set({ fill: style.color || style.fill }))
      }
      object.setCoords(); canvas.requestRenderAll(); commit(); onSelectionChange(object)
    },
    setSelectedText: text => {
      const canvas = canvasRef.current, object = canvas?.getActiveObject()
      if (!canvas || !(object instanceof IText) || !text.trim()) return
      object.set({ text: text.trim() }); object.setCoords(); canvas.requestRenderAll(); commit(); onSelectionChange(object)
    },
    editSelectedText: () => {
      const object = canvasRef.current?.getActiveObject()
      return object instanceof IText ? { object, text: object.text } : null
    },
    getBackgroundCanvas: () => backgroundElement.current,
    discardSelection: () => { canvasRef.current?.discardActiveObject(); canvasRef.current?.requestRenderAll(); onSelectionChange(null) }
  }), [page.id, settings, onSelectionChange])

  const backgroundClass = page.background.kind === 'blank' ? `paper-${page.background.template || 'white'}` : ''
  return <div className={`page-stage ${backgroundClass}`} style={{ width: page.width, height: page.height, backgroundColor: page.background.color || '#fff' }}>
    <canvas ref={backgroundElement} className="background-canvas" aria-hidden="true" />
    <canvas ref={canvasElement} className="annotation-canvas" aria-label="Editable annotation canvas" />
    <div
      ref={eraserPreviewElement}
      className="eraser-preview"
      style={{ width: settings.eraserSize, height: settings.eraserSize }}
      aria-hidden="true"
    />
  </div>
})

export default BoardCanvas
