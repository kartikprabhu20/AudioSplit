let ctx: AudioContext | null = null

function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  return getContext().decodeAudioData(arrayBuffer)
}

export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0)
  }
  const out = new Float32Array(n)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] += data[i]
  }
  const inv = 1 / buffer.numberOfChannels
  for (let i = 0; i < n; i++) out[i] *= inv
  return out
}

export interface RMSResult {
  rms: Float32Array
  hopSamples: number
  sampleRate: number
}

export function computeRMS(
  samples: Float32Array,
  sampleRate: number,
  windowMs = 20,
  hopMs = 10,
): RMSResult {
  const windowSamples = Math.max(1, Math.round((windowMs / 1000) * sampleRate))
  const hopSamples = Math.max(1, Math.round((hopMs / 1000) * sampleRate))
  const numFrames = Math.max(0, Math.floor((samples.length - windowSamples) / hopSamples) + 1)
  const rms = new Float32Array(numFrames)
  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSamples
    let sum = 0
    for (let i = 0; i < windowSamples; i++) {
      const s = samples[start + i]
      sum += s * s
    }
    rms[f] = Math.sqrt(sum / windowSamples)
  }
  return { rms, hopSamples, sampleRate }
}
