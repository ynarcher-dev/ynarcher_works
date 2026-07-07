import { Badge, Banner, Button, cn, InlineSelect, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type DragEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_OPTIONS, type EntityKey } from '@/features/networks/config'
import {
  createUploadBatch,
  findPriorBatchByHash,
  recordContribution,
} from '@/features/networks/hooks'
import {
  buildTemplateCsv,
  downloadCsv,
  findExistingContacts,
  parseBulkCsv,
  rowToPayload,
  sha256Hex,
  type ParsedRow,
} from '@/features/networks/bulkUpload'

const MISC_LABEL = '미분류'

interface ReviewRow extends ParsedRow {
  /** 편집 가능한 저장 대상 구분 라벨(디폴트: CSV값 또는 미분류). */
  categoryLabel: string
  /** 확실중복(기존 이메일·전화 일치). */
  isDup: boolean
  /** 최종 업로드 포함 여부(중복·이름누락은 기본 제외). */
  include: boolean
}

/** CSV 구분값이 유효 카테고리면 그대로, 아니면 미분류로 수렴. */
function normalizeCategory(raw: string): string {
  return CATEGORY_OPTIONS.find((o) => o.label === raw.trim())?.label ?? MISC_LABEL
}

/**
 * 대용량 업로드(미분류 데이터베이스 하위). 드래그앤드랍 → 리뷰 테이블(구분/중복 확인) → 최종 업로드.
 * 구분 미지정은 미분류로, 확실중복(이메일·전화 일치)은 색상 표기 후 기본 제외한다.
 */
export function BulkUploadPanel() {
  const toast = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [priorUpload, setPriorUpload] = useState<{ filename: string | null; created_at: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadFile = async (file: File) => {
    const text = await file.text()
    const parsed = parseBulkCsv(text)
    if (parsed.length === 0) {
      toast.show('헤더와 최소 1개 데이터 행이 필요합니다.', 'warning')
      return
    }
    setFileName(file.name)
    // 동일 파일(콘텐츠 해시) 재업로드 이력 경고.
    const hash = await sha256Hex(text)
    setFileHash(hash)
    setPriorUpload(await findPriorBatchByHash(hash))
    const initial: ReviewRow[] = parsed.map((r) => ({
      ...r,
      categoryLabel: normalizeCategory(r.category),
      isDup: false,
      include: Boolean(r.name),
    }))
    setRows(initial)

    // 확실중복(이메일/전화 일치) 검사 후 해당 행을 표기·기본 제외한다.
    setChecking(true)
    try {
      const emails = initial.map((r) => r.email).filter(Boolean)
      const phones = initial.map((r) => r.phone.replace(/\D/g, '')).filter(Boolean)
      const existing = await findExistingContacts(emails, phones)
      setRows((prev) =>
        prev.map((r) => {
          const phoneDigits = r.phone.replace(/\D/g, '')
          const dup =
            (Boolean(r.email) && existing.emails.has(r.email)) ||
            (Boolean(phoneDigits) && existing.phones.has(phoneDigits))
          return dup ? { ...r, isDup: true, include: false } : r
        }),
      )
    } finally {
      setChecking(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  const setCategory = (line: number, label: string) =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, categoryLabel: label } : r)))
  const toggleInclude = (line: number) =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, include: !r.include } : r)))
  const reset = () => {
    setRows([])
    setFileName('')
    setFileHash('')
    setPriorUpload(null)
  }

  const includable = rows.filter((r) => r.include && r.name)
  const dupCount = rows.filter((r) => r.isDup).length
  const invalidCount = rows.filter((r) => !r.name).length

  const commit = async () => {
    if (includable.length === 0) {
      toast.show('업로드할 행이 없습니다.', 'warning')
      return
    }
    const byTable = new Map<EntityKey, Record<string, unknown>[]>()
    for (const r of includable) {
      const { target, payload } = rowToPayload(r, r.categoryLabel)
      const list = byTable.get(target) ?? []
      list.push(payload)
      byTable.set(target, list)
    }
    setBusy(true)
    try {
      // 배치 이력 생성(파일 해시·집계). 이후 등록 행을 업로드 출처 기여로 기록한다.
      const batchId = await createUploadBatch({
        filename: fileName,
        contentHash: fileHash,
        total: rows.length,
        inserted: includable.length,
        merged: 0,
        skipped: rows.length - includable.length,
      })
      for (const [table, list] of byTable) {
        const { data, error } = await supabase.from(table).insert(list).select('id')
        if (error) throw error
        await qc.invalidateQueries({ queryKey: ['networks', table] })
        const ids = ((data ?? []) as { id: string }[]).map((d) => d.id)
        await Promise.all(
          ids.map((id) =>
            recordContribution({ table, id, action: 'created', source: 'upload', batchId }),
          ),
        )
      }
      toast.show(`${includable.length}건 업로드 완료`, 'success')
      reset()
    } catch {
      toast.show('업로드에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body text-gray-600">
          CSV를 올리면 각 행의 <b>구분</b>에 맞춰 네트워크로 등록됩니다. 구분이 없으면 미분류로 적재됩니다.
        </p>
        <Button
          variant="outline"
          onClick={() => downloadCsv('네트워크_업로드_템플릿.csv', buildTemplateCsv())}
        >
          템플릿 다운로드
        </Button>
      </div>

      {rows.length === 0 ? (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-radius-lg border-2 border-dashed text-center transition-colors',
            dragging ? 'border-brand bg-brand/5' : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
          )}
        >
          <span className="text-body font-medium text-gray-700">
            CSV 파일을 여기로 드래그하거나 클릭해 선택하세요
          </span>
          <span className="text-caption text-gray-400">.csv (UTF-8)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void loadFile(file)
            }}
          />
        </label>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-caption text-gray-600">
              <span className="font-medium text-gray-800">{fileName}</span>
              <Badge tone="neutral" size="sm">전체 {rows.length}</Badge>
              <Badge tone="success" size="sm">업로드 대상 {includable.length}</Badge>
              {dupCount > 0 && <Badge tone="danger" size="sm">중복 {dupCount}</Badge>}
              {invalidCount > 0 && <Badge tone="warning" size="sm">이름 없음 {invalidCount}</Badge>}
              {checking && <span className="text-gray-400">중복 검사 중…</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} disabled={busy}>
                다시 선택
              </Button>
              <Button onClick={() => void commit()} disabled={busy || checking}>
                최종 업로드 ({includable.length})
              </Button>
            </div>
          </div>

          {priorUpload && (
            <Banner tone="warning">
              동일한 내용의 파일이 <b>{priorUpload.created_at.slice(0, 10)}</b>에 이미 업로드된 이력이
              있습니다{priorUpload.filename ? ` (${priorUpload.filename})` : ''}. 중복 업로드가 아닌지 확인하세요.
            </Banner>
          )}

          {dupCount > 0 && (
            <Banner tone="warning">
              빨간 행은 이미 등록된 이메일·전화가 있는 <b>확실중복</b>입니다. 기본 제외되며,
              같은 인물 병합(연혁 기록)은 다음 단계에서 지원됩니다. 그래도 새로 등록하려면 체크하세요.
            </Banner>
          )}

          <div className="overflow-x-auto rounded-radius-lg border border-gray-200">
            <table className="w-full text-caption">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {['포함', '이름', '소속', '부서', '직책', '이메일', '연락처', '구분', '상태'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.line}
                    className={cn(
                      'border-t border-gray-100',
                      r.isDup && 'bg-danger-subtle',
                      !r.name && 'opacity-50',
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={!r.name}
                        onChange={() => toggleInclude(r.line)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-gray-800">{r.name || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.affiliation || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.department || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.position || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.email || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.phone || '-'}</td>
                    <td className="px-3 py-1.5">
                      <InlineSelect
                        value={r.categoryLabel}
                        onChange={(e) => setCategory(r.line, e.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((o) => (
                          <option key={o.key} value={o.label}>{o.label}</option>
                        ))}
                      </InlineSelect>
                    </td>
                    <td className="px-3 py-1.5">
                      {!r.name ? (
                        <Badge tone="warning" size="sm">이름 없음</Badge>
                      ) : r.isDup ? (
                        <Badge tone="danger" size="sm">중복</Badge>
                      ) : (
                        <Badge tone="success" size="sm">신규</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
