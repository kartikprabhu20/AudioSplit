import { useRef } from 'react'

interface Props {
  canEdit: boolean
  canRemove: boolean
  segmentCount: number
  onAdd: () => void
  onRemove: () => void
  onImport: (file: File) => void
  onExport: () => void
  onReset: () => void
}

export function Toolbar({
  canEdit,
  canRemove,
  segmentCount,
  onAdd,
  onRemove,
  onImport,
  onExport,
  onReset,
}: Props) {
  const importRef = useRef<HTMLInputElement>(null)

  return (
    <div className="toolbar">
      <button onClick={onAdd} disabled={!canEdit} title="Add a segment at the current playhead">
        + Segment
      </button>
      <button onClick={onRemove} disabled={!canRemove} title="Remove the selected segment">
        − Segment
      </button>
      <span className="toolbar__count">{segmentCount} segment{segmentCount === 1 ? '' : 's'}</span>
      <div className="toolbar__spacer" />
      <button
        onClick={() => importRef.current?.click()}
        disabled={!canEdit}
        title="Replace segments from a .segments.json file"
      >
        Import JSON
      </button>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImport(file)
          e.target.value = ''
        }}
      />
      <button onClick={onExport} disabled={!canEdit || segmentCount === 0}>
        Export JSON
      </button>
      <button onClick={onReset} disabled={!canEdit} className="toolbar__secondary">
        Load new file
      </button>
    </div>
  )
}
