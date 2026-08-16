import { PencilBrush, type Point, type TSimplePathData } from 'fabric'

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
