import { Banner, Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EntityConfig } from '@/features/networks/config'

interface RowError {
  line: number
  message: string
}

/**
 * 엑셀/CSV 대량 임포터(행 단위 유효성 검사).
 * 1행은 헤더(필드명), 이후 각 행을 검증 후 유효 행만 일괄 등록한다.
 * (바이너리 .xlsx 파싱은 SheetJS 도입 시 확장 — 현재는 CSV 붙여넣기 지원)
 */
export function ImporterModal({
  config,
  open,
  onClose,
}: {
  config: EntityConfig
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [csv, setCsv] = useState('')
  const [errors, setErrors] = useState<RowError[]>([])
  const [busy, setBusy] = useState(false)

  const onImport = async () => {
    setErrors([])
    const lines = csv.trim().split('\n').filter((l) => l.trim())
    if (lines.length < 2) {
      toast.show('헤더와 최소 1개 데이터 행이 필요합니다.', 'warning')
      return
    }
    const headers = (lines[0] ?? '').split(',').map((h) => h.trim())
    const validRows: Record<string, unknown>[] = []
    const rowErrors: RowError[] = []

    lines.slice(1).forEach((line, idx) => {
      const cells = line.split(',')
      const row: Record<string, unknown> = {}
      headers.forEach((h, i) => {
        if (config.fields.some((f) => f.name === h)) {
          row[h] = cells[i]?.trim() || null
        }
      })
      const missing = config.fields
        .filter((f) => f.required && !row[f.name])
        .map((f) => f.label)
      if (missing.length > 0) {
        rowErrors.push({ line: idx + 2, message: `필수값 누락: ${missing.join(', ')}` })
      } else {
        validRows.push(row)
      }
    })

    setErrors(rowErrors)
    if (validRows.length === 0) {
      toast.show('등록 가능한 유효 행이 없습니다.', 'warning')
      return
    }

    setBusy(true)
    try {
      const { error } = await supabase.from(config.table).insert(validRows)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['networks', config.table] })
      toast.show(
        `${validRows.length}건 등록 완료${rowErrors.length ? ` (오류 ${rowErrors.length}건 제외)` : ''}`,
        'success',
      )
      if (rowErrors.length === 0) {
        setCsv('')
        onClose()
      }
    } catch {
      toast.show('일괄 등록에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const headerHint = config.fields.map((f) => f.name).join(',')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${config.label} 대량 등록 (CSV)`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={() => void onImport()} disabled={busy}>
            검증 후 등록
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-caption text-gray-500">
          1행 헤더 예시: <code className="text-gray-700">{headerHint}</code>
        </p>
        <TextArea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={`${headerHint}\n와이앤아처,핀테크,...`}
        />
        {errors.length > 0 && (
          <Banner tone="warning">
            <p className="font-medium">행 단위 오류 {errors.length}건</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((e) => (
                <li key={e.line} className="text-caption">
                  {e.line}행: {e.message}
                </li>
              ))}
            </ul>
          </Banner>
        )}
      </div>
    </Modal>
  )
}
