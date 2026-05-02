import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImagePlus, UploadCloud, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FileDropzoneProps = {
  label: string
  files: File[]
  accept?: string
  multiple?: boolean
  maxFileSizeMb?: number
  error?: string
  hint?: string
  onChange: (files: File[]) => void
}

const defaultMaxFileSizeMb = 10

type RejectedFile = {
  name: string
  reason: string
}

function isImage(file: File) {
  return file.type.startsWith('image/')
}

function matchesAcceptToken(file: File, token: string) {
  const normalizedToken = token.trim().toLowerCase()

  if (!normalizedToken) {
    return true
  }

  if (normalizedToken.startsWith('.')) {
    return file.name.toLowerCase().endsWith(normalizedToken)
  }

  if (normalizedToken.endsWith('/*')) {
    const mimeGroup = normalizedToken.slice(0, -1)
    return file.type.toLowerCase().startsWith(mimeGroup)
  }

  return file.type.toLowerCase() === normalizedToken
}

function formatFileSize(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function validateFiles(files: File[], accept: string | undefined, maxFileSizeBytes: number) {
  const tokens = accept?.trim() ? accept.split(',') : []
  const accepted: File[] = []
  const rejected: RejectedFile[] = []

  files.forEach((file) => {
    if (tokens.length > 0 && !tokens.some((token) => matchesAcceptToken(file, token))) {
      rejected.push({ name: file.name, reason: 'tip invalid' })
      return
    }

    if (file.size > maxFileSizeBytes) {
      rejected.push({ name: file.name, reason: 'prea mare' })
      return
    }

    accepted.push(file)
  })

  return { accepted, rejected }
}

function mergeFiles(existingFiles: File[], nextFiles: File[], multiple: boolean) {
  const combined = multiple ? [...existingFiles, ...nextFiles] : nextFiles.slice(0, 1)
  const uniqueFiles = new Map<string, File>()

  combined.forEach((file) => {
    uniqueFiles.set(`${file.name}-${file.size}-${file.lastModified}`, file)
  })

  return Array.from(uniqueFiles.values())
}

export function FileDropzone({ label, files, accept, multiple = true, maxFileSizeMb = defaultMaxFileSizeMb, error, hint, onChange }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([])
  const maxFileSizeBytes = Math.max(1, maxFileSizeMb) * 1024 * 1024
  const sizeHint = `Maxim ${formatFileSize(maxFileSizeBytes)} / fisier.`
  const displayHint = hint ? `${hint} ${sizeHint}` : sizeHint
  const previews = useMemo(
    () =>
      files.map((file) => ({
        name: file.name,
        isImage: isImage(file),
        url: isImage(file) ? URL.createObjectURL(file) : '',
      })),
    [files],
  )

  useEffect(() => {
    return () => {
      previews.forEach((preview) => {
        if (preview.url) {
          URL.revokeObjectURL(preview.url)
        }
      })
    }
  }, [previews])

  const addFiles = (nextFiles: File[]) => {
    const { accepted, rejected } = validateFiles(nextFiles, accept, maxFileSizeBytes)

    setRejectedFiles(rejected)

    if (accepted.length > 0) {
      onChange(mergeFiles(files, accepted, multiple))
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-3xl border border-dashed bg-card p-5 transition-colors',
          error ? 'border-destructive bg-destructive/5' : 'border-border hover:border-primary/40',
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          addFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />

        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-full bg-secondary p-3">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold">{label}</p>
            <p className="text-sm text-muted-foreground">Trage fișierele aici sau apasă pentru a selecta.</p>
            <p className="mt-1 text-xs text-muted-foreground">{displayHint}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" />
            Alege fișiere
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rejectedFiles.length > 0 ? (
        <p className="text-sm text-destructive">
          Nu am adaugat {rejectedFiles.map((file) => `${file.name} (${file.reason})`).join(', ')}. Verifica tipul fisierului si limita de{' '}
          {formatFileSize(maxFileSizeBytes)}.
        </p>
      ) : null}

      {previews.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {previews.map((preview, index) => (
            <div key={`${preview.name}-${index}`} className="rounded-2xl border p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{preview.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {preview.isImage ? (
                <img src={preview.url} alt={preview.name} className="h-36 w-full rounded-2xl object-cover" />
              ) : (
                <div className="flex h-36 items-center justify-center rounded-2xl bg-secondary text-sm text-muted-foreground">
                  <FileText className="mr-2 h-5 w-5" />
                  PDF / document
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
