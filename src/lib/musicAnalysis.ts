import { downmixToMono } from './audio'
import { makeId } from './segmenter'

export interface Punch {
  id: string
  time: number
  type: number
  strength: number
}

export interface AnalysisCache {
  novelty: Float32Array
  frameTimes: Float32Array
  features: Float32Array[]
  candidates: Candidate[]
  bpm: number
  duration: number
}

interface Candidate {
  frame: number
  time: number
  strength: number
}

export interface AnalysisOptions {
  maxX: number
}

const WINDOW_SIZE = 1024
const HOP_SIZE = 512
const TARGET_SAMPLE_RATE = 22050
const MIN_PEAK_DISTANCE_MS = 250
const FEATURE_WINDOW_MS = 100
const MAX_CANDIDATES = 1024

export function analyzeBuffer(buffer: AudioBuffer): AnalysisCache {
  const mono = downmixToMono(buffer)
  const { samples, sampleRate } = maybeDownsample(mono, buffer.sampleRate, TARGET_SAMPLE_RATE)

  const { novelty, frameTimes } = spectralFluxNovelty(samples, sampleRate)
  const candidates = pickCandidates(novelty, frameTimes, sampleRate)
  const features = extractFeatures(samples, sampleRate, candidates)
  const bpm = estimateBpm(novelty, sampleRate)

  return {
    novelty,
    frameTimes,
    features,
    candidates,
    bpm,
    duration: buffer.duration,
  }
}

export function pickPunches(cache: AnalysisCache, x: number, n: number): Punch[] {
  const xClamped = Math.max(1, Math.min(cache.candidates.length, x))
  const top = cache.candidates.slice(0, xClamped)
  const features = top.map((_, i) => cache.features[i])
  const types = clusterTypes(features, Math.max(1, Math.min(24, n)))
  const sorted = top
    .map((c, i) => ({ c, type: types[i] }))
    .sort((a, b) => a.c.time - b.c.time)
  return sorted.map(({ c, type }) => ({
    id: makeId(),
    time: c.time,
    type,
    strength: c.strength,
  }))
}

function maybeDownsample(
  samples: Float32Array,
  sampleRate: number,
  target: number,
): { samples: Float32Array; sampleRate: number } {
  if (sampleRate <= target) return { samples, sampleRate }
  const ratio = sampleRate / target
  const outLen = Math.floor(samples.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(samples.length - 1, i0 + 1)
    const frac = src - i0
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac
  }
  return { samples: out, sampleRate: target }
}

function hann(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  }
  return w
}

function spectralFluxNovelty(
  samples: Float32Array,
  _sampleRate: number,
): { novelty: Float32Array; frameTimes: Float32Array; magnitudes: Float32Array[] } {
  const numFrames = Math.max(0, Math.floor((samples.length - WINDOW_SIZE) / HOP_SIZE) + 1)
  const window = hann(WINDOW_SIZE)
  const fft = new FFT(WINDOW_SIZE)
  const re = new Float32Array(WINDOW_SIZE)
  const im = new Float32Array(WINDOW_SIZE)
  const bins = WINDOW_SIZE / 2
  let prevMag = new Float32Array(bins)
  const magnitudes: Float32Array[] = new Array(numFrames)
  const flux = new Float32Array(numFrames)
  const frameTimes = new Float32Array(numFrames)

  for (let f = 0; f < numFrames; f++) {
    const off = f * HOP_SIZE
    for (let i = 0; i < WINDOW_SIZE; i++) {
      re[i] = samples[off + i] * window[i]
      im[i] = 0
    }
    fft.transform(re, im)
    const mag = new Float32Array(bins)
    let sum = 0
    for (let k = 0; k < bins; k++) {
      const m = Math.hypot(re[k], im[k])
      mag[k] = m
      if (f > 0) {
        const d = m - prevMag[k]
        if (d > 0) sum += d
      }
    }
    flux[f] = sum
    magnitudes[f] = mag
    prevMag = mag
    frameTimes[f] = (f * HOP_SIZE) / _sampleRate
  }

  // baseline subtraction with median filter of width 9, then half-wave rectify
  const novelty = new Float32Array(numFrames)
  const radius = 4
  const buf: number[] = new Array(2 * radius + 1)
  for (let f = 0; f < numFrames; f++) {
    let cnt = 0
    for (let k = -radius; k <= radius; k++) {
      const idx = f + k
      if (idx >= 0 && idx < numFrames) {
        buf[cnt++] = flux[idx]
      }
    }
    const slice = buf.slice(0, cnt).sort((a, b) => a - b)
    const median = slice[Math.floor(cnt / 2)]
    novelty[f] = Math.max(0, flux[f] - median)
  }

  // normalize so peaks live in [0, 1]
  let max = 0
  for (let i = 0; i < novelty.length; i++) if (novelty[i] > max) max = novelty[i]
  if (max > 0) {
    for (let i = 0; i < novelty.length; i++) novelty[i] /= max
  }

  return { novelty, frameTimes, magnitudes }
}

function pickCandidates(
  novelty: Float32Array,
  frameTimes: Float32Array,
  sampleRate: number,
): Candidate[] {
  const minDistFrames = Math.max(
    1,
    Math.round((MIN_PEAK_DISTANCE_MS / 1000) * (sampleRate / HOP_SIZE)),
  )
  const peaks: Candidate[] = []
  for (let i = 1; i < novelty.length - 1; i++) {
    if (novelty[i] <= 0) continue
    if (novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1]) {
      peaks.push({ frame: i, time: frameTimes[i], strength: novelty[i] })
    }
  }
  peaks.sort((a, b) => b.strength - a.strength)

  const accepted: Candidate[] = []
  for (const p of peaks) {
    if (accepted.length >= MAX_CANDIDATES) break
    let ok = true
    for (const a of accepted) {
      if (Math.abs(a.frame - p.frame) < minDistFrames) {
        ok = false
        break
      }
    }
    if (ok) accepted.push(p)
  }
  return accepted
}

function extractFeatures(
  samples: Float32Array,
  sampleRate: number,
  candidates: Candidate[],
): Float32Array[] {
  const winLen = Math.max(WINDOW_SIZE, Math.round((FEATURE_WINDOW_MS / 1000) * sampleRate))
  const fftSize = nextPow2(winLen)
  const window = hann(fftSize)
  const fft = new FFT(fftSize)
  const re = new Float32Array(fftSize)
  const im = new Float32Array(fftSize)
  const bins = fftSize / 2
  const nyquist = sampleRate / 2
  const lowCut = (250 / nyquist) * bins
  const midCut = (2000 / nyquist) * bins
  const features: Float32Array[] = []

  for (const c of candidates) {
    const center = Math.round(c.time * sampleRate)
    const start = Math.max(0, center - Math.floor(fftSize / 2))
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i
      if (idx >= 0 && idx < samples.length) re[i] = samples[idx] * window[i]
    }
    fft.transform(re, im)

    let totalEnergy = 0
    let weighted = 0
    let low = 0
    let mid = 0
    let high = 0
    for (let k = 1; k < bins; k++) {
      const m = Math.hypot(re[k], im[k])
      const e = m * m
      totalEnergy += e
      weighted += k * m
      if (k < lowCut) low += e
      else if (k < midCut) mid += e
      else high += e
    }
    let magSum = 0
    for (let k = 1; k < bins; k++) magSum += Math.hypot(re[k], im[k])
    const centroid = magSum > 0 ? weighted / magSum : 0
    const norm = totalEnergy > 0 ? 1 / totalEnergy : 0
    features.push(
      Float32Array.of(centroid / bins, low * norm, mid * norm, high * norm),
    )
  }
  return features
}

function clusterTypes(features: Float32Array[], k: number): number[] {
  const n = features.length
  if (n === 0) return []
  if (k === 1) return new Array(n).fill(0)
  if (k >= n) {
    return features.map((_, i) => i)
  }

  const dim = features[0].length
  // k-means++ init
  const centers: Float32Array[] = []
  const firstIdx = Math.floor(Math.random() * n)
  centers.push(new Float32Array(features[firstIdx]))
  while (centers.length < k) {
    const dists = new Float32Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      let best = Infinity
      for (const c of centers) {
        const d = sqDist(features[i], c)
        if (d < best) best = d
      }
      dists[i] = best
      total += best
    }
    if (total === 0) {
      centers.push(new Float32Array(features[Math.floor(Math.random() * n)]))
      continue
    }
    let r = Math.random() * total
    let picked = 0
    for (let i = 0; i < n; i++) {
      r -= dists[i]
      if (r <= 0) {
        picked = i
        break
      }
    }
    centers.push(new Float32Array(features[picked]))
  }

  const assignments = new Int32Array(n)
  for (let iter = 0; iter < 50; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let best = -1
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const d = sqDist(features[i], centers[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        changed = true
      }
    }
    const sums: Float32Array[] = []
    const counts = new Int32Array(k)
    for (let c = 0; c < k; c++) sums.push(new Float32Array(dim))
    for (let i = 0; i < n; i++) {
      const a = assignments[i]
      counts[a]++
      const f = features[i]
      const s = sums[a]
      for (let d = 0; d < dim; d++) s[d] += f[d]
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue
      const s = sums[c]
      const inv = 1 / counts[c]
      for (let d = 0; d < dim; d++) centers[c][d] = s[d] * inv
    }
    if (!changed) break
  }

  // Re-order clusters by centroid (first feature dim = spectral centroid)
  // so type 0 is consistently the lowest-pitched group.
  const order = centers
    .map((c, i) => ({ i, key: c[0] }))
    .sort((a, b) => a.key - b.key)
    .map((o) => o.i)
  const remap = new Int32Array(k)
  for (let newIdx = 0; newIdx < k; newIdx++) remap[order[newIdx]] = newIdx

  const out: number[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = remap[assignments[i]]
  return out
}

function sqDist(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return s
}

function estimateBpm(novelty: Float32Array, sampleRate: number): number {
  const framesPerSec = sampleRate / HOP_SIZE
  const minBpm = 70
  const maxBpm = 180
  const minLag = Math.floor((60 / maxBpm) * framesPerSec)
  const maxLag = Math.ceil((60 / minBpm) * framesPerSec)
  if (novelty.length < maxLag + 1) return 120

  let bestLag = minLag
  let bestVal = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i + lag < novelty.length; i++) {
      s += novelty[i] * novelty[i + lag]
    }
    if (s > bestVal) {
      bestVal = s
      bestLag = lag
    }
  }
  const bpm = (60 * framesPerSec) / bestLag
  return Math.round(bpm)
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// Simple iterative radix-2 Cooley-Tukey FFT (in-place).
class FFT {
  private readonly size: number
  private readonly cosT: Float32Array
  private readonly sinT: Float32Array
  private readonly rev: Int32Array

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of 2, got ${size}`)
    }
    this.size = size
    const half = size >> 1
    this.cosT = new Float32Array(half)
    this.sinT = new Float32Array(half)
    for (let i = 0; i < half; i++) {
      this.cosT[i] = Math.cos((-2 * Math.PI * i) / size)
      this.sinT[i] = Math.sin((-2 * Math.PI * i) / size)
    }
    this.rev = new Int32Array(size)
    const bits = Math.log2(size) | 0
    for (let i = 0; i < size; i++) {
      let x = i
      let r = 0
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1)
        x >>= 1
      }
      this.rev[i] = r
    }
  }

  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]
      if (j > i) {
        let t = re[i]
        re[i] = re[j]
        re[j] = t
        t = im[i]
        im[i] = im[j]
        im[j] = t
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1
      const tableStep = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += tableStep) {
          const c = this.cosT[k]
          const s = this.sinT[k]
          const tre = re[j + half] * c - im[j + half] * s
          const tim = re[j + half] * s + im[j + half] * c
          re[j + half] = re[j] - tre
          im[j + half] = im[j] - tim
          re[j] += tre
          im[j] += tim
        }
      }
    }
  }
}
