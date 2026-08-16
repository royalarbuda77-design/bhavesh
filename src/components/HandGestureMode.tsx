import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Check, Crosshair, Hand, Maximize2, Minimize2, Settings2, X } from 'lucide-react'
import type { Tool, ToolSettings } from '../types'
import type { VirtualPointerPhase } from './BoardCanvas'
import { mapHandPoint, pinchIsActive, smoothHandPoint } from '../lib/handTracking'

interface Props {
  enabled: boolean
  tool: Tool
  settings: ToolSettings
  onPointer: (phase: VirtualPointerPhase, x: number, y: number, cursorSize: number) => void
  onSettingsChange: (patch: Partial<ToolSettings>) => void
  onClose: () => void
  onError: (message: string) => void
}

type Status = 'starting-camera' | 'loading-model' | 'show-hand' | 'ready' | 'drawing' | 'paused' | 'error'
type Landmark = { x: number; y: number; z: number }
type HandResult = { landmarks?: Landmark[][]; handednesses?: { categoryName?: string; displayName?: string }[][] }

const drawableTools = new Set<Tool>(['pen', 'pencil', 'highlighter', 'eraser', 'shapes', 'arrow', 'line'])
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

function statusText(status: Status, tool: Tool) {
  if (status === 'starting-camera') return 'Requesting camera…'
  if (status === 'loading-model') return 'Loading hand tracking…'
  if (status === 'show-hand') return 'Show your index finger'
  if (status === 'drawing') return tool === 'eraser' ? 'Pinched · erasing' : 'Pinched · drawing'
  if (status === 'paused') return 'Choose Pen, Pencil, Highlighter or Eraser'
  if (status === 'error') return 'HD mode unavailable'
  return 'Hand ready · pinch to draw'
}

export default function HandGestureMode({ enabled, tool, settings, onPointer, onSettingsChange, onClose, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const handLandmarkerRef = useRef<{ detectForVideo: (video: HTMLVideoElement, timestamp: number) => HandResult; close: () => void } | null>(null)
  const callbackRef = useRef(onPointer)
  const settingsChangeRef = useRef(onSettingsChange)
  const errorRef = useRef(onError)
  const settingsRef = useRef(settings)
  const toolRef = useRef(tool)
  const drawingRef = useRef(false)
  const smoothedRef = useRef<{ x: number; y: number } | null>(null)
  const calibrationRef = useRef({ x: settings.hdCalibrationX, y: settings.hdCalibrationY })
  const calibratingRef = useRef(false)
  const manualDrawRef = useRef(false)
  const [status, setStatus] = useState<Status>('starting-camera')
  const [minimized, setMinimized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [showCalibrationIntro, setShowCalibrationIntro] = useState(() => settings.hdCalibrationX === 0 && settings.hdCalibrationY === 0)
  const [manualDraw, setManualDraw] = useState(false)
  const [handedness, setHandedness] = useState('')

  callbackRef.current = onPointer
  settingsChangeRef.current = onSettingsChange
  errorRef.current = onError
  settingsRef.current = settings
  toolRef.current = tool
  calibrationRef.current = { x: settings.hdCalibrationX, y: settings.hdCalibrationY }
  manualDrawRef.current = manualDraw

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let animationFrame = 0
    let stream: MediaStream | null = null
    let lastVideoTime = -1
    let lastDetectionAt = 0
    let missingFrames = 0
    let handWasReady = false

    const releasePointer = (leave = false) => {
      if (drawingRef.current) {
        callbackRef.current('up', smoothedRef.current?.x ?? .5, smoothedRef.current?.y ?? .5, settingsRef.current.hdCursorSize)
        drawingRef.current = false
      }
      if (leave) callbackRef.current('leave', smoothedRef.current?.x ?? .5, smoothedRef.current?.y ?? .5, settingsRef.current.hdCursorSize)
    }

    const chooseHand = (result: HandResult) => {
      if (!result.landmarks?.length) return -1
      const preference = settingsRef.current.hdHandPreference
      if (preference === 'any') return 0
      const match = result.handednesses?.findIndex(categories => {
        const label = categories[0]?.categoryName || categories[0]?.displayName || ''
        return label.toLowerCase() === preference.toLowerCase()
      }) ?? -1
      return match >= 0 ? match : 0
    }

    const processResult = (result: HandResult) => {
      const handIndex = chooseHand(result)
      if (handIndex < 0 || !result.landmarks?.[handIndex]) {
        missingFrames += 1
        if (missingFrames > 3) {
          releasePointer(true)
          smoothedRef.current = null
          if (handWasReady) setStatus('show-hand')
          handWasReady = false
        }
        return
      }

      missingFrames = 0
      handWasReady = true
      const landmarks = result.landmarks[handIndex]
      const index = landmarks[8]
      const thumb = landmarks[4]
      const palmWidth = Math.max(.035, distance(landmarks[5], landmarks[17]))
      const pinchRatio = distance(index, thumb) / palmWidth
      const currentSettings = settingsRef.current
      const rawX = currentSettings.hdMirror ? 1 - index.x : index.x
      const rawY = index.y

      if (calibratingRef.current) {
        const calibration = { x: .5 - rawX, y: .5 - rawY }
        calibrationRef.current = calibration
        settingsChangeRef.current({ hdCalibrationX: calibration.x, hdCalibrationY: calibration.y })
        calibratingRef.current = false
        setCalibrating(false)
      }

      const mapped = mapHandPoint(index, {
        mirror: currentSettings.hdMirror,
        sensitivity: currentSettings.hdSensitivity,
        calibrationX: calibrationRef.current.x,
        calibrationY: calibrationRef.current.y
      })
      const smoothed = smoothHandPoint(smoothedRef.current, mapped, currentSettings.hdSmoothing)
      smoothedRef.current = smoothed

      const handLabel = result.handednesses?.[handIndex]?.[0]?.categoryName || ''
      if (handLabel) setHandedness(handLabel)
      const supportsDrawing = drawableTools.has(toolRef.current)
      const pinched = pinchIsActive(pinchRatio, drawingRef.current, currentSettings.hdSensitivity)
      const shouldDraw = supportsDrawing && (currentSettings.hdPinchToDraw ? pinched : manualDrawRef.current)

      if (!supportsDrawing) {
        releasePointer()
        callbackRef.current('move', smoothed.x, smoothed.y, currentSettings.hdCursorSize)
        setStatus('paused')
      } else if (shouldDraw && !drawingRef.current) {
        drawingRef.current = true
        callbackRef.current('down', smoothed.x, smoothed.y, currentSettings.hdCursorSize)
        setStatus('drawing')
      } else if (shouldDraw) {
        callbackRef.current('move', smoothed.x, smoothed.y, currentSettings.hdCursorSize)
        setStatus('drawing')
      } else {
        if (drawingRef.current) {
          callbackRef.current('up', smoothed.x, smoothed.y, currentSettings.hdCursorSize)
          drawingRef.current = false
        }
        callbackRef.current('move', smoothed.x, smoothed.y, currentSettings.hdCursorSize)
        setStatus('ready')
      }
    }

    const detect = () => {
      if (disposed) return
      const video = videoRef.current
      const detector = handLandmarkerRef.current
      const now = performance.now()
      // Cap inference at 30 FPS; rendering and Fabric pointer input continue on rAF.
      if (video && detector && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetectionAt >= 30) {
        lastVideoTime = video.currentTime
        lastDetectionAt = now
        try { processResult(detector.detectForVideo(video, now)) }
        catch { /* A dropped camera frame should not stop the tracking loop. */ }
      }
      animationFrame = requestAnimationFrame(detect)
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.')
      setStatus('starting-camera')
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }
      })
      if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
      const video = videoRef.current
      if (!video) throw new Error('Camera preview is unavailable.')
      video.srcObject = stream
      await video.play()
      setStatus('loading-model')

      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const base = `${window.location.origin}/mediapipe`
      const vision = await FilesetResolver.forVisionTasks(`${base}/wasm`, true)
      const options = {
        baseOptions: { modelAssetPath: `${base}/models/hand_landmarker.task`, delegate: 'GPU' as const },
        runningMode: 'VIDEO' as const,
        numHands: 2,
        minHandDetectionConfidence: .55,
        minHandPresenceConfidence: .5,
        minTrackingConfidence: .5
      }
      try {
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, options)
      } catch {
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' as const } })
      }
      if (disposed) { handLandmarkerRef.current.close(); handLandmarkerRef.current = null; return }
      setStatus('show-hand')
      animationFrame = requestAnimationFrame(detect)
    }

    void start().catch(error => {
      if (disposed) return
      setStatus('error')
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser settings to use HD Hand Draw.'
        : `HD Hand Draw could not start: ${error instanceof Error ? error.message : 'Unknown camera error'}`
      errorRef.current(message)
    })

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      releasePointer(true)
      handLandmarkerRef.current?.close()
      handLandmarkerRef.current = null
      stream?.getTracks().forEach(track => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || drawingRef.current) return
    callbackRef.current('move', smoothedRef.current?.x ?? .5, smoothedRef.current?.y ?? .5, settings.hdCursorSize)
  }, [enabled, settings.hdCursorSize])

  if (!enabled) return null

  const beginCalibration = () => {
    calibratingRef.current = true
    setCalibrating(true)
    setShowCalibrationIntro(false)
    setSettingsOpen(false)
  }

  return <section className={`hd-camera-panel surface ${minimized ? 'minimized' : ''}`} aria-label="HD Hand Gesture Drawing">
    <div className="hd-panel-head">
      <div className="hd-title"><span className={`hd-live-dot ${status === 'drawing' ? 'drawing' : ''}`} /><div><b>HD Hand Draw: ON</b><small>{statusText(status, tool)}</small></div></div>
      <div className="hd-head-actions"><button className="icon-btn" onClick={() => setMinimized(value => !value)} aria-label={minimized ? 'Show camera' : 'Minimize camera'}>{minimized ? <Maximize2 /> : <Minimize2 />}</button><button className="icon-btn" onClick={onClose} aria-label="Turn off HD Hand Draw"><X /></button></div>
    </div>

    {!minimized && <>
      <div className="hd-video-wrap">
        <video ref={videoRef} muted playsInline autoPlay className={settings.hdMirror ? 'mirrored' : ''} />
        <div className="hd-video-guide"><Crosshair /><span>{calibrating ? 'Point at the centre and hold still…' : status === 'drawing' ? 'PINCH: DRAWING' : 'Pinch thumb + index to draw'}</span></div>
        {status === 'error' && <div className="hd-camera-error"><CameraOff /><span>Camera unavailable</span></div>}
      </div>
      <div className="hd-quick-controls">
        <span><Hand /> {handedness || 'Waiting for hand'}</span>
        {!settings.hdPinchToDraw && <button className={manualDraw ? 'active' : ''} onClick={() => setManualDraw(value => !value)}>{manualDraw ? 'Stop drawing' : 'Start drawing'}</button>}
        <button onClick={beginCalibration}><Crosshair /> Calibrate</button>
        <button onClick={() => setSettingsOpen(value => !value)}><Settings2 /> Settings</button>
      </div>
      {showCalibrationIntro && <div className="hd-onboarding"><b>Quick calibration</b><span>1. Show your hand · 2. Point index finger at the centre · 3. Pinch to write</span><div><button onClick={() => setShowCalibrationIntro(false)}>Skip</button><button className="primary" onClick={beginCalibration}>Calibrate now</button></div></div>}
      {calibrating && <div className="hd-calibration-note"><Camera /><span>Show one hand and point your index finger at the centre of the camera frame.</span></div>}
      {settingsOpen && <div className="hd-settings">
        <label>Hand sensitivity <b>{settings.hdSensitivity.toFixed(1)}×</b><input type="range" min="0.7" max="1.6" step="0.1" value={settings.hdSensitivity} onChange={event => onSettingsChange({ hdSensitivity: +event.target.value })} /></label>
        <label>Cursor size <b>{settings.hdCursorSize}px</b><input type="range" min="8" max="36" step="2" value={settings.hdCursorSize} onChange={event => onSettingsChange({ hdCursorSize: +event.target.value })} /></label>
        <label>Drawing smoothing <b>{Math.round(settings.hdSmoothing * 100)}%</b><input type="range" min="0" max="1" step="0.05" value={settings.hdSmoothing} onChange={event => onSettingsChange({ hdSmoothing: +event.target.value })} /></label>
        <div className="hd-setting-row"><span>Pinch to draw</span><button className={`toggle ${settings.hdPinchToDraw ? 'on' : ''}`} onClick={() => onSettingsChange({ hdPinchToDraw: !settings.hdPinchToDraw })}><i /></button></div>
        <div className="hd-setting-row"><span>Mirror camera</span><button className={`toggle ${settings.hdMirror ? 'on' : ''}`} onClick={() => onSettingsChange({ hdMirror: !settings.hdMirror })}><i /></button></div>
        <div className="hd-hand-choice"><span>Preferred hand</span>{(['any', 'Left', 'Right'] as const).map(value => <button key={value} className={settings.hdHandPreference === value ? 'active' : ''} onClick={() => onSettingsChange({ hdHandPreference: value })}>{value}</button>)}</div>
        <button className="hd-reset-calibration" onClick={() => onSettingsChange({ hdCalibrationX: 0, hdCalibrationY: 0 })}><Check /> Reset calibration</button>
      </div>}
    </>}
  </section>
}
