import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileDropZone } from '../components/FileDropZone'
import { WaveformView, type WaveformMarker } from '../components/WaveformView'
import { decodeFile } from '../lib/audio'
import {
  analyzeBuffer,
  pickPunches,
  type AnalysisCache,
  type Punch,
} from '../lib/musicAnalysis'
import {
  colorForType,
  exportBeatSaberMap,
  exportPunchesJson,
  gridForType,
} from '../lib/beatsaber'

interface LoadedFile {
  file: File
  duration: number
}

const DEFAULT_X = 30
const DEFAULT_N = 4
const MAX_N = 24

export default function MusicPage() {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [cache, setCache] = useState<AnalysisCache | null>(null)
  const [x, setX] = useState(DEFAULT_X)
  const [n, setN] = useState(DEFAULT_N)
  const [bpm, setBpm] = useState(120)
  const [playing, setPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)

  const controlsRef = useRef<{
    playPause: () => void
    getCurrentTime: () => number
    seekTo: (sec: number) => void
  } | null>(null)

  const punches: Punch[] = useMemo(() => {
    if (!cache) return []
    return pickPunches(cache, x, n)
  }, [cache, x, n])

  const handleFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    setInfo(null)
    setCache(null)
    setLoaded(null)
    try {
      const buffer = await decodeFile(file)
      const analysis = analyzeBuffer(buffer)
      setCache(analysis)
      setBpm(analysis.bpm)
      setLoaded({ file, duration: buffer.duration })
      setX(Math.min(DEFAULT_X, analysis.candidates.length))
      if (analysis.candidates.length === 0) {
        setInfo('No variations detected in this audio.')
      } else {
        setInfo(
          `Detected ${analysis.candidates.length} candidate variations. Auto-BPM: ${analysis.bpm}.`,
        )
      }
    } catch (e) {
      console.error(e)
      setError(`Failed to analyze "${file.name}": ${(e as Error).message || 'unsupported format?'}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const handleReset = useCallback(() => {
    setLoaded(null)
    setCache(null)
    setError(null)
    setInfo(null)
    setX(DEFAULT_X)
    setN(DEFAULT_N)
    setBpm(120)
  }, [])

  const handleExportJson = useCallback(() => {
    if (!loaded || punches.length === 0) return
    exportPunchesJson(punches, loaded.file.name, stripExt(loaded.file.name))
  }, [loaded, punches])

  const handleExportBeatSaber = useCallback(async () => {
    if (!loaded || punches.length === 0) return
    setExporting(true)
    try {
      await exportBeatSaberMap(
        punches,
        bpm,
        stripExt(loaded.file.name),
        stripExt(loaded.file.name),
      )
    } catch (e) {
      console.error(e)
      setError(`Beat Saber export failed: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }, [loaded, punches, bpm])

  const markers: WaveformMarker[] = useMemo(
    () =>
      punches.map((p, i) => ({
        id: p.id,
        time: p.time,
        color: colorForType(p.type),
        label: String(i + 1),
      })),
    [punches],
  )

  const maxX = cache?.candidates.length ?? 0

  // Clamp x if the candidate pool shrinks (e.g., a different file with fewer peaks).
  useEffect(() => {
    if (cache && x > cache.candidates.length) setX(Math.max(1, cache.candidates.length))
  }, [cache, x])

  return (
    <div className="app">
      <header className="app__header">
        <Link to="/" className="app__back">← AudioSplit</Link>
        <h1>MusicSplit</h1>
        <p>
          Detect variations in music and place numbered punch markers across N types. Export as
          JSON or a Beat Saber v3 map.
        </p>
      </header>

      {!loaded ? (
        <main className="app__main">
          <FileDropZone onFile={handleFile} disabled={busy} />
          {busy && <div className="status">Analyzing audio…</div>}
          {error && <div className="status status--error">{error}</div>}
        </main>
      ) : (
        <main className="app__main">
          <div className="controls">
            <div className="controls__group">
              <span className="controls__label">Punches (X)</span>
              <Stepper
                value={x}
                min={1}
                max={maxX}
                onChange={setX}
                disabled={busy || maxX === 0}
              />
              <span className="controls__label" style={{ marginLeft: 4 }}>
                /{maxX}
              </span>
            </div>
            <div className="controls__group">
              <span className="controls__label">Types (N)</span>
              <Stepper
                value={n}
                min={1}
                max={MAX_N}
                onChange={setN}
                disabled={busy}
              />
            </div>
            <div className="controls__group">
              <span className="controls__label">BPM</span>
              <input
                type="number"
                className="controls__number"
                value={bpm}
                min={30}
                max={300}
                onChange={(e) => setBpm(Math.max(30, Math.min(300, Number(e.target.value) || 0)))}
              />
            </div>
            <button
              className="controls__action"
              onClick={() => controlsRef.current?.playPause()}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <div className="controls__spacer" />
            <button
              className="controls__action"
              onClick={handleExportJson}
              disabled={punches.length === 0}
            >
              Export JSON
            </button>
            <button
              className="controls__action"
              onClick={handleExportBeatSaber}
              disabled={punches.length === 0 || exporting}
            >
              {exporting ? 'Building zip…' : 'Export Beat Saber map'}
            </button>
            <button className="controls__action" onClick={handleReset}>
              Reset
            </button>
          </div>

          <WaveformView
            file={loaded.file}
            segments={[]}
            selectedId={null}
            markers={markers}
            onReady={() => {}}
            onSegmentUpdated={() => {}}
            onSegmentClicked={() => {}}
            onMarkerClicked={(id) => {
              const p = punches.find((pp) => pp.id === id)
              if (p) controlsRef.current?.seekTo(p.time)
            }}
            onPlayStateChanged={setPlaying}
            onTimeUpdate={() => {}}
            registerControls={(c) => {
              controlsRef.current = c
            }}
          />

          {info && <div className="status">{info}</div>}

          <PunchList
            punches={punches}
            onSeek={(time) => controlsRef.current?.seekTo(time)}
          />
        </main>
      )}
    </div>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="controls__stepper">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.round(v))))
        }}
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  )
}

function PunchList({
  punches,
  onSeek,
}: {
  punches: Punch[]
  onSeek: (time: number) => void
}) {
  if (punches.length === 0) return null
  return (
    <div className="punches">
      <div className="punches__row punches__row--head">
        <span>#</span>
        <span>Time (s)</span>
        <span>Type</span>
        <span>Grid</span>
      </div>
      {punches.map((p, i) => {
        const g = gridForType(p.type)
        return (
          <div
            key={p.id}
            className="punches__row"
            onClick={() => onSeek(p.time)}
            title="Click to seek"
          >
            <span>{i + 1}</span>
            <span>{p.time.toFixed(3)}</span>
            <span className="punches__type">
              <span
                className="punches__swatch"
                style={{ background: colorForType(p.type) }}
              />
              {p.type}
            </span>
            <span>
              {g.c === 0 ? 'L' : 'R'} (x={g.x}, y={g.y})
            </span>
          </div>
        )
      })}
    </div>
  )
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}
