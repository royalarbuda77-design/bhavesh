export interface NormalizedPoint { x: number; y: number }

const clamp = (value: number) => Math.max(0, Math.min(1, value))

export function mapHandPoint(
  cameraPoint: NormalizedPoint,
  options: { mirror: boolean; sensitivity: number; calibrationX: number; calibrationY: number }
): NormalizedPoint {
  const rawX = options.mirror ? 1 - cameraPoint.x : cameraPoint.x
  const calibratedX = rawX + options.calibrationX
  const calibratedY = cameraPoint.y + options.calibrationY
  return {
    x: clamp(.5 + (calibratedX - .5) * options.sensitivity),
    y: clamp(.5 + (calibratedY - .5) * options.sensitivity)
  }
}

export function smoothHandPoint(previous: NormalizedPoint | null, next: NormalizedPoint, smoothing: number) {
  if (!previous) return next
  const alpha = .76 - clamp(smoothing) * .56
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha
  }
}

export function pinchIsActive(ratio: number, wasActive: boolean, sensitivity: number) {
  const start = .4 * (.82 + sensitivity * .12)
  // Hysteresis prevents noisy landmarks from rapidly toggling pen-down/up.
  return ratio < (wasActive ? start + .14 : start)
}
