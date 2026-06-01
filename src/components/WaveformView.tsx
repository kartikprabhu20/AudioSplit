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
  onReady: (durationSec: number) => void
  onSegmentUpdated: (id: string, start: number, end: number) => void
  onSegmentClicked: (id: string) => void
  onMarkerClicked?: (id: string) => void
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

export function WaveformView({
  file,
  segments,
  selectedId,
  markers,
  onReady,
  onSegmentUpdated,
  onSegmentClicked,
  onMarkerClicked,
  onPlayStateChanged,
  onTimeUpdate,
  registerControls,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const regionByIdRef = useRef<Map<string, Region>>(new Map())
  const segmentsRef = useRef<Segment[]>(segments)
  const lastIdsKeyRef = useRef<string>('')
  const [duration, setDuration] = useState(0)
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
    ws.on('timeupdate', (t) => onTimeUpdate(t))

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
      {markers && markers.length > 0 && duration > 0 && (
        <div className="marker-overlay">
          {markers.map((m) => {
            const pct = Math.max(0, Math.min(100, (m.time / duration) * 100))
            return (
              <div
                key={m.id}
                style={{
                  position: 'absolute',
                  top: 12,
                  bottom: 12,
                  left: `${pct}%`,
                  width: 2,
                  background: m.color,
                  pointerEvents: 'none',
                  opacity: 0.85,
                }}
              >
                <button
                  type="button"
                  className="marker-label"
                  style={{
                    background: m.color,
                    left: 0,
                    pointerEvents: onMarkerClicked ? 'auto' : 'none',
                    border: 'none',
                    cursor: onMarkerClicked ? 'pointer' : 'default',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkerClicked?.(m.id)
                  }}
                >
                  {m.label}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
