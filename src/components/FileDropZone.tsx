import { useRef, useState } from 'react'

interface Props {
  onFile?: (file: File) => void
  onFiles?: (files: File[]) => void
  multiple?: boolean
  accept?: string
  title?: string
  hint?: string
  disabled?: boolean
}

export function FileDropZone({
  onFile,
  onFiles,
  multiple = false,
  accept = 'audio/*',
  title = 'Drop an audio file here',
  hint = 'or click to browse — wav, mp3, m4a, ogg, flac…',
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    if (multiple && onFiles) {
      onFiles(list)
    } else if (onFile) {
      onFile(list[0])
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      className={`dropzone${dragOver ? ' dropzone--over' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (!disabled) handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="dropzone__title">{title}</div>
      <div className="dropzone__hint">{hint}</div>
    </div>
  )
}
