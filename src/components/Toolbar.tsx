interface Props {
  canEdit: boolean
  canRemove: boolean
  segmentCount: number
  onAdd: () => void
  onRemove: () => void
  onExport: () => void
  onReset: () => void
}

export function Toolbar({
  canEdit,
  canRemove,
  segmentCount,
  onAdd,
  onRemove,
  onExport,
  onReset,
}: Props) {
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
      <button onClick={onExport} disabled={!canEdit || segmentCount === 0}>
        Export JSON
      </button>
      <button onClick={onReset} disabled={!canEdit} className="toolbar__secondary">
        Load new file
      </button>
    </div>
  )
}
