import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileDropZone } from '../components/FileDropZone'
import { Toolbar } from '../components/Toolbar'
import { WaveformView } from '../components/WaveformView'
import { decodeFile } from '../lib/audio'
import { colorForIndex, makeId, segmentBuffer } from '../lib/segmenter'
import type { Segment } from '../lib/types'

interface LoadedFile {
  file: File
  duration: number
}

export default function VoicePage() {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const controlsRef = useRef<{ playPause: () => void; getCurrentTime: () => number } | null>(null)
  const currentTimeRef = useRef(0)

  const handleFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    setInfo(null)
    setSegments([])
    setSelectedId(null)
    try {
      const buffer = await decodeFile(file)
      const detected = segmentBuffer(buffer)
      setSegments(detected)
      setLoaded({ file, duration: buffer.duration })
      if (detected.length === 0) {
        setInfo('No segments detected — add some with the + button or load a different file.')
      }
    } catch (e) {
      console.error(e)
      setError(`Failed to decode "${file.name}": ${(e as Error).message || 'unsupported format?'}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const handleSegmentUpdated = useCallback((id: string, start: number, end: number) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, start: Math.min(start, end), end: Math.max(start, end) } : s,
      ),
    )
  }, [])

  const handleAdd = useCallback(() => {
    if (!loaded) return
    const t = currentTimeRef.current
    const duration = loaded.duration
    const defaultLen = Math.min(0.5, duration)
    let start = t
    let end = t + defaultLen
    if (end > duration) {
      end = duration
      start = Math.max(0, end - defaultLen)
    }
    const newSeg: Segment = {
      id: makeId(),
      start,
      end,
      color: colorForIndex(segments.length),
    }
    setSegments((prev) => [...prev, newSeg])
    setSelectedId(newSeg.id)
  }, [loaded, segments.length])

  const handleRemove = useCallback(() => {
    if (!selectedId) return
    setSegments((prev) => prev.filter((s) => s.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  const handleExport = useCallback(() => {
    if (!loaded) return
    const data = [...segments]
      .sort((a, b) => a.start - b.start)
      .map((s) => [round(s.start, 3), round(s.end - s.start, 3)])
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stripExt(loaded.file.name)}.segments.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [loaded, segments])

  const handleReset = useCallback(() => {
    setLoaded(null)
    setSegments([])
    setSelectedId(null)
    setPlaying(false)
    setError(null)
    setInfo(null)
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <Link to="/" className="app__back">← AudioSplit</Link>
        <h1>VoiceSplit</h1>
        <p>Auto-segment spoken-word audio and export segment timings.</p>
      </header>

      {!loaded ? (
        <main className="app__main">
          <FileDropZone onFile={handleFile} disabled={busy} />
          {busy && <div className="status">Decoding and segmenting…</div>}
          {error && <div className="status status--error">{error}</div>}
        </main>
      ) : (
        <main className="app__main">
          <Toolbar
            playing={playing}
            canEdit={!busy}
            canRemove={selectedId !== null}
            segmentCount={segments.length}
            onPlayPause={() => controlsRef.current?.playPause()}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onExport={handleExport}
            onReset={handleReset}
          />
          <div className="file-name" title={loaded.file.name}>
            <span className="file-name__icon" aria-hidden="true">♪</span>
            {loaded.file.name}
          </div>
          <WaveformView
            file={loaded.file}
            segments={segments}
            selectedId={selectedId}
            onReady={() => {}}
            onSegmentUpdated={handleSegmentUpdated}
            onSegmentClicked={(id) => setSelectedId(id)}
            onPlayStateChanged={setPlaying}
            onTimeUpdate={(t) => {
              currentTimeRef.current = t
            }}
            registerControls={(c) => {
              controlsRef.current = c
            }}
          />
          {info && <div className="status">{info}</div>}
          <SegmentList
            segments={segments}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>
      )}
    </div>
  )
}

function SegmentList({
  segments,
  selectedId,
  onSelect,
}: {
  segments: Segment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (segments.length === 0) return null
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  return (
    <ol className="segments">
      {sorted.map((s, i) => (
        <li
          key={s.id}
          className={`segments__item${s.id === selectedId ? ' segments__item--selected' : ''}`}
          onClick={() => onSelect(s.id)}
        >
          <span className="segments__swatch" style={{ background: s.color }} />
          <span className="segments__index">#{i + 1}</span>
          <span className="segments__time">
            start {s.start.toFixed(3)}s · length {(s.end - s.start).toFixed(3)}s
          </span>
        </li>
      ))}
    </ol>
  )
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}
