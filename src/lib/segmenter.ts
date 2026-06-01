import { computeRMS, downmixToMono } from './audio'
import type { Segment } from './types'

const WINDOW_MS = 20
const HOP_MS = 10
const NOISE_PERCENTILE = 0.1
const THRESHOLD_MULTIPLIER = 4
const MIN_ABSOLUTE_THRESHOLD = 0.005
const MIN_DURATION_S = 0.08
const MIN_GAP_S = 0.12
const PAD_S = 0.03

const COLORS = [
  'rgba(239, 68, 68, 0.35)',
  'rgba(34, 197, 94, 0.35)',
  'rgba(59, 130, 246, 0.35)',
  'rgba(234, 179, 8, 0.35)',
  'rgba(168, 85, 247, 0.35)',
  'rgba(14, 165, 233, 0.35)',
]

export function colorForIndex(i: number): string {
  return COLORS[i % COLORS.length]
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
  return sorted[idx]
}

export function segmentBuffer(buffer: AudioBuffer): Segment[] {
  const samples = downmixToMono(buffer)
  const { rms, hopSamples, sampleRate } = computeRMS(samples, buffer.sampleRate, WINDOW_MS, HOP_MS)
  if (rms.length === 0) return []

  const sorted = new Float32Array(rms)
  sorted.sort()
  const noiseFloor = percentile(sorted, NOISE_PERCENTILE)
  const threshold = Math.max(noiseFloor * THRESHOLD_MULTIPLIER, MIN_ABSOLUTE_THRESHOLD)

  const hopS = hopSamples / sampleRate
  const duration = buffer.duration

  const raw: Array<{ start: number; end: number }> = []
  let inSeg = false
  let segStart = 0
  for (let i = 0; i < rms.length; i++) {
    const voiced = rms[i] > threshold
    if (voiced && !inSeg) {
      inSeg = true
      segStart = i * hopS
    } else if (!voiced && inSeg) {
      inSeg = false
      raw.push({ start: segStart, end: i * hopS })
    }
  }
  if (inSeg) raw.push({ start: segStart, end: rms.length * hopS })

  const merged: Array<{ start: number; end: number }> = []
  for (const s of raw) {
    const last = merged[merged.length - 1]
    if (last && s.start - last.end < MIN_GAP_S) {
      last.end = s.end
    } else {
      merged.push({ ...s })
    }
  }

  const filtered = merged.filter((s) => s.end - s.start >= MIN_DURATION_S)

  const padded = filtered.map((s) => ({
    start: Math.max(0, s.start - PAD_S),
    end: Math.min(duration, s.end + PAD_S),
  }))

  return padded.map((s, i) => ({
    id: makeId(),
    start: s.start,
    end: s.end,
    color: colorForIndex(i),
  }))
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}
