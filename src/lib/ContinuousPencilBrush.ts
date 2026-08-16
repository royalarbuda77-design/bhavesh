import { PencilBrush, type Point, type TEvent, type TSimplePathData } from 'fabric'

export interface StrokeInputPoint {
  x: number
  y: number
  pressure: number
  timestamp: number
}

function eventPressure(event: Event) {
  return 'pressure' in event && typeof event.pressure === 'number' && event.pressure > 0 ? event.pressure : 0.5
}

/**
 * A free-drawing brush that keeps every sampled pointer point.
 *
 * Fabric's PencilBrush normally decimates points when the pointer is released.
 * That optimization can visibly alter tight loops and self-intersections, especially
 * in Gujarati handwriting. This brush deliberately disables that optimization while
 * retaining Fabric's midpoint smoothing for a responsive, natural-looking preview.
 */
export class ContinuousPencilBrush extends PencilBrush {
  override decimate = 0
  private inputSamples: StrokeInputPoint[] = []

  override onMouseDown(point: Point, event: TEvent) {
    this.inputSamples = []
    this.capture(point, event.e)
    super.onMouseDown(point, event)
  }

  override onMouseMove(point: Point, event: TEvent) {
    this.capture(point, event.e)
    super.onMouseMove(point, event)
  }

  private capture(point: Point, event: Event) {
    const previous = this.inputSamples[this.inputSamples.length - 1]
    if (previous && previous.x === point.x && previous.y === point.y) return
    this.inputSamples.push({ x: point.x, y: point.y, pressure: eventPressure(event), timestamp: performance.now() })
  }

  getInputSamples() {
    return this.inputSamples.map(point => ({ ...point }))
  }

  override decimatePoints(points: Point[], _distance: number) {
    return points.slice()
  }

  override _reset() {
    super._reset()
    // Never inherit an erasing blend mode from a previous tool or render pass.
    this.canvas.contextTop.globalCompositeOperation = 'source-over'
  }

  override createPath(pathData: TSimplePathData) {
    const path = super.createPath(pathData)
    path.set({
      fill: null,
      globalCompositeOperation: 'source-over',
      objectCaching: false,
      strokeLineCap: 'round',
      strokeLineJoin: 'round'
    })
    return path
  }
}
