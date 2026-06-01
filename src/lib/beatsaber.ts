import JSZip from 'jszip'
import type { Punch } from './musicAnalysis'

const MAX_TYPES = 24

// Fixed mapping: type index -> (x, y, c) on the Beat Saber 4x3 grid.
// x: 0..3 (left -> right), y: 0..2 (bottom -> top), c: 0=red(left hand), 1=blue(right hand).
// Order is chosen so low N counts hit the most natural punch positions first.
const GRID_ORDER: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [2, 1, 1],   // chest L / R
  [0, 1, 0], [3, 1, 1],   // outer chest L / R
  [1, 0, 0], [2, 0, 1],   // low center L / R
  [1, 2, 0], [2, 2, 1],   // high center L / R
  [0, 0, 0], [3, 0, 1],
  [0, 2, 0], [3, 2, 1],
  [1, 1, 1], [2, 1, 0],
  [0, 1, 1], [3, 1, 0],
  [1, 0, 1], [2, 0, 0],
  [1, 2, 1], [2, 2, 0],
  [0, 0, 1], [3, 0, 0],
  [0, 2, 1], [3, 2, 0],
]

export function gridForType(type: number): { x: number; y: number; c: number } {
  const t = ((type % MAX_TYPES) + MAX_TYPES) % MAX_TYPES
  const [x, y, c] = GRID_ORDER[t]
  return { x, y, c }
}

// 24 visually distinct colors for waveform markers (HSL-spaced).
const PALETTE: string[] = (() => {
  const out: string[] = []
  for (let i = 0; i < MAX_TYPES; i++) {
    const hue = (i * 360) / 12
    const sat = i < 12 ? 75 : 55
    const light = i < 12 ? 50 : 65
    out.push(`hsl(${hue % 360}, ${sat}%, ${light}%)`)
  }
  return out
})()

export function colorForType(type: number): string {
  const t = ((type % MAX_TYPES) + MAX_TYPES) % MAX_TYPES
  return PALETTE[t]
}

export interface JsonPunchExport {
  i: number
  t_sec: number
  type: number
}

export function exportPunchesJson(
  punches: Punch[],
  songName: string,
  filename: string,
): void {
  const data: JsonPunchExport[] = punches.map((p, i) => ({
    i: i + 1,
    t_sec: round(p.time, 3),
    type: p.type,
  }))
  const payload = {
    song: songName,
    count: data.length,
    punches: data,
  }
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${filename}.punches.json`,
  )
}

interface ColorNote {
  b: number
  x: number
  y: number
  c: number
  d: number
  a: number
}

export async function exportBeatSaberMap(
  punches: Punch[],
  bpm: number,
  songName: string,
  filename: string,
): Promise<void> {
  const colorNotes: ColorNote[] = punches.map((p) => {
    const g = gridForType(p.type)
    return {
      b: round((p.time * bpm) / 60, 4),
      x: g.x,
      y: g.y,
      c: g.c,
      d: 8, // any direction (dot) - boxing/punch style
      a: 0,
    }
  })

  const beatmap = {
    version: '3.3.0',
    bpmEvents: [],
    rotationEvents: [],
    colorNotes,
    bombNotes: [],
    obstacles: [],
    sliders: [],
    burstSliders: [],
    waypoints: [],
    basicBeatmapEvents: [],
    colorBoostBeatmapEvents: [],
    lightColorEventBoxGroups: [],
    lightRotationEventBoxGroups: [],
    lightTranslationEventBoxGroups: [],
    basicEventTypesWithKeywords: { d: [] },
    useNormalEventsAsCompatibleEvents: false,
  }

  const info = {
    _version: '2.1.0',
    _songName: songName,
    _songSubName: '',
    _songAuthorName: '',
    _levelAuthorName: 'AudioSplit',
    _beatsPerMinute: bpm,
    _songTimeOffset: 0,
    _shuffle: 0,
    _shufflePeriod: 0.5,
    _previewStartTime: 12,
    _previewDuration: 10,
    _songFilename: 'song.ogg',
    _coverImageFilename: 'cover.png',
    _environmentName: 'DefaultEnvironment',
    _allDirectionsEnvironmentName: 'GlassDesertEnvironment',
    _difficultyBeatmapSets: [
      {
        _beatmapCharacteristicName: 'Standard',
        _difficultyBeatmaps: [
          {
            _difficulty: 'ExpertPlus',
            _difficultyRank: 9,
            _beatmapFilename: 'ExpertPlusStandard.dat',
            _noteJumpMovementSpeed: 16,
            _noteJumpStartBeatOffset: 0,
          },
        ],
      },
    ],
  }

  const zip = new JSZip()
  zip.file('Info.dat', JSON.stringify(info, null, 2))
  zip.file('ExpertPlusStandard.dat', JSON.stringify(beatmap, null, 2))
  zip.file('cover.png', placeholderCoverPng(), { base64: true })
  zip.file(
    'README.txt',
    [
      `AudioSplit / MusicSplit Beat Saber map: ${songName}`,
      '',
      'To make this importable into Beat Saber:',
      "  1. Convert your audio file to Ogg Vorbis (.ogg) using ffmpeg, Audacity, or an online tool.",
      "     ffmpeg example:  ffmpeg -i input.mp3 -c:a libvorbis -q:a 6 song.ogg",
      `  2. Add the resulting "song.ogg" to this folder next to Info.dat.`,
      '  3. Optionally replace cover.png with a 512x512 cover image.',
      '  4. Place the folder (or the zip) into your Beat Saber CustomLevels directory.',
      '',
      `BPM: ${bpm}`,
      `Notes: ${punches.length}`,
    ].join('\n'),
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  download(blob, `${filename}.beatsaber.zip`)
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

// 1x1 dark-navy PNG, base64. Beat Saber accepts any PNG as cover, will scale up.
// The user is encouraged to replace it via the README inside the zip.
function placeholderCoverPng(): string {
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg=='
}
