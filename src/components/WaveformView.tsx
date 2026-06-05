import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Segment } from '../lib/types'

export interface WaveformMarker {
  id: string
  time: number
  color: string
  label: string
}

interface Props {
  file: File
  segments: Segment[]
  selectedId: string | null
  markers?: WaveformMarker[]
  selectedMarkerId?: string | null
  onReady: (durationSec: number) => void
  onSegmentUpdated: (id: string, start: number, end: number) => void
  onSegmentClicked: (id: string) => void
  onMarkerClicked?: (id: string) => void
  onMarkerMoved?: (id: string, time: number) => void
  onPlayStateChanged: (playing: boolean) => void
  onTimeUpdate: (timeSec: number) => void
  registerControls: (controls: {
    playPause: () => void
    getCurrentTime: () => number
    seekTo: (sec: number) => void
  }) => void
}

function selectedColor(base: string): string {
  return base.replace(/0\.35\)/, '0.6)')
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 1000)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

export function WaveformView({
  file,
  segments,
  selectedId,
  markers,
  selectedMarkerId,
  onReady,
  onSegmentUpdated,
  onSegmentClicked,
  onMarkerClicked,
  onMarkerMoved,
  onPlayStateChanged,
  onTimeUpdate,
  registerControls,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; startX: number; moved: boolean } | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const regionByIdRef = useRef<Map<string, Region>>(new Map())
  const segmentsRef = useRef<Segment[]>(segments)
  const lastIdsKeyRef = useRef<string>('')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  segmentsRef.current = segments

  useEffect(() => {
    if (!containerRef.current) return

    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#94a3b8',
      progressColor: '#475569',
      cursorColor: '#0f172a',
      height: 160,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [regions],
    })
    wsRef.current = ws
    regionsRef.current = regions

    ws.on('ready', () => {
      const d = ws.getDuration()
      setDuration(d)
      onReady(d)
    })
    ws.on('play', () => onPlayStateChanged(true))
    ws.on('pause', () => onPlayStateChanged(false))
    ws.on('finish', () => onPlayStateChanged(false))
    ws.on('timeupdate', (t) => {
      setCurrentTime(t)
      onTimeUpdate(t)
    })

    regions.on('region-updated', (region: Region) => {
      onSegmentUpdated(region.id, region.start, region.end)
    })
    regions.on('region-clicked', (region: Region, e: MouseEvent) => {
      e.stopPropagation()
      onSegmentClicked(region.id)
    })

    registerControls({
      playPause: () => ws.playPause(),
      getCurrentTime: () => ws.getCurrentTime(),
      seekTo: (sec: number) => {
        const d = ws.getDuration()
        if (d > 0) ws.seekTo(Math.max(0, Math.min(1, sec / d)))
      },
    })

    const blobUrl = URL.createObjectURL(file)
    ws.load(blobUrl)

    return () => {
      ws.destroy()
      URL.revokeObjectURL(blobUrl)
      wsRef.current = null
      regionsRef.current = null
      regionByIdRef.current.clear()
      lastIdsKeyRef.current = ''
      setDuration(0)
      setCurrentTime(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Sync regions when the set of segment ids changes (add/remove).
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions) return
    const idsKey = segments.map((s) => s.id).join('|')
    if (idsKey === lastIdsKeyRef.current) return
    lastIdsKeyRef.current = idsKey

    regions.clearRegions()
    regionByIdRef.current.clear()
    for (const s of segments) {
      const region = regions.addRegion({
        id: s.id,
        start: s.start,
        end: s.end,
        color: s.id === selectedId ? selectedColor(s.color) : s.color,
        drag: true,
        resize: true,
      })
      regionByIdRef.current.set(s.id, region)
    }
  }, [segments, selectedId])

  useEffect(() => {
    for (const s of segments) {
      const region = regionByIdRef.current.get(s.id)
      if (!region) continue
      const color = s.id === selectedId ? selectedColor(s.color) : s.color
      region.setOptions({ color })
    }
  }, [selectedId, segments])

  return (
    <div className="waveform-wrap">
      <div ref={containerRef} className="waveform" />
      {duration > 0 && (
        <div
          className="cursor-time"
          style={{ left: `${Math.max(0, Math.min(100, (currentTime / duration) * 100))}%` }}
        >
          {formatTime(currentTime)}
        </div>
      )}
      {markers && markers.length > 0 && duration > 0 && (
        <div className="marker-overlay" ref={overlayRef}>
          {markers.map((m) => {
            const pct = Math.max(0, Math.min(100, (m.time / duration) * 100))
            const selected = m.id === selectedMarkerId
            const interactive = !!onMarkerClicked || !!onMarkerMoved
            return (
              <div
                key={m.id}
                className={`marker${selected ? ' marker--selected' : ''}`}
                style={{
                  left: `${pct}%`,
                  pointerEvents: interactive ? 'auto' : 'none',
                }}
                onPointerDown={(e) => {
                  if (!interactive) return
                  e.stopPropagation()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragRef.current = { id: m.id, startX: e.clientX, moved: false }
                  onMarkerClicked?.(m.id)
                }}
                onPointerMove={(e) => {
                  const drag = dragRef.current
                  if (!drag || drag.id !== m.id || !onMarkerMoved) return
                  if (!drag.moved && Math.abs(e.clientX - drag.startX) <= 4) return
                  drag.moved = true
                  const rect = overlayRef.current?.getBoundingClientRect()
                  if (!rect || rect.width === 0) return
                  const ratio = (e.clientX - rect.left) / rect.width
                  const time = Math.max(0, Math.min(duration, ratio * duration))
                  onMarkerMoved(m.id, time)
                }}
                onPointerUp={(e) => {
                  if (dragRef.current?.id === m.id) dragRef.current = null
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId)
                  }
                }}
              >
                <span className="marker__line" style={{ background: m.color }} />
                <span className="marker__label" style={{ background: m.color }}>
                  {m.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
