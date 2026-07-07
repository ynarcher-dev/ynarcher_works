import { Badge, Banner, Button, cn, InlineSelect, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type DragEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_OPTIONS, ENTITIES, type EntityKey } from '@/features/networks/config'
import {
  createUploadBatch,
  findPriorBatchByHash,
  recordContribution,
} from '@/features/networks/hooks'
import {
  buildEnrichment,
  buildTemplateCsv,
  downloadCsv,
  findExistingMatches,
  parseBulkCsv,
  rowToPayload,
  sha256Hex,
  type ExistingRef,
  type ParsedRow,
} from '@/features/networks/bulkUpload'

const MISC_LABEL = '미분류'

type Decision = 'new' | 'merge' | 'skip'

interface ReviewRow extends ParsedRow {
  /** 편집 가능한 저장 대상 구분 라벨(디폴트: CSV값 또는 미분류). */
  categoryLabel: string
  /** 확실중복(이메일·전화 일치)으로 매칭된 기존 레코드. 없으면 신규. */
  match: ExistingRef | null
  /** 처리 방식. 중복이면 기본 합치기, 아니면 신규. 이름 없으면 건너뛰기 고정. */
  decision: Decision
}

/** CSV 구분값이 유효 카테고리면 그대로, 아니면 미분류로 수렴. */
function normalizeCategory(raw: string): string {
  return CATEGORY_OPTIONS.find((o) => o.label === raw.trim())?.label ?? MISC_LABEL
}

function decisionOptions(hasMatch: boolean): { value: Decision; label: string }[] {
  const base: { value: Decision; label: string }[] = [
    { value: 'new', label: '신규 등록' },
    { value: 'skip', label: '건너뛰기' },
  ]
  return hasMatch ? [{ value: 'merge', label: '합치기' }, ...base] : base
}

/**
 * 대용량 업로드(미분류 데이터베이스 하위). 드래그앤드랍 → 리뷰(구분·중복 결정) → 최종 업로드.
 * 구분 미지정은 미분류로, 확실중복(이메일·전화)은 행별 합치기/신규/건너뛰기로 결정한다.
 * 합치기는 기존 레코드의 빈 필드만 보강하고 기여 이력을 남긴다(비파괴·공동 관리).
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
    const hash = await sha256Hex(text)
    setFileHash(hash)
    setPriorUpload(await findPriorBatchByHash(hash))

    const initial: ReviewRow[] = parsed.map((r) => ({
      ...r,
      categoryLabel: normalizeCategory(r.category),
      match: null,
      decision: r.name ? 'new' : 'skip',
    }))
    setRows(initial)

    // 확실중복 매칭 후 해당 행을 기본 '합치기'로 전환한다.
    setChecking(true)
    try {
      const matches = await findExistingMatches(
        parsed.map((r) => ({ line: r.line, email: r.email, phone: r.phone })),
      )
      setRows((prev) =>
        prev.map((r) => {
          const m = matches.get(r.line)
          return m ? { ...r, match: m, decision: r.name ? 'merge' : 'skip' } : r
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
  const setDecision = (line: number, decision: Decision) =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, decision } : r)))
  const reset = () => {
    setRows([])
    setFileName('')
    setFileHash('')
    setPriorUpload(null)
  }

  const newRows = rows.filter((r) => r.decision === 'new' && r.name)
  const mergeRows = rows.filter((r) => r.decision === 'merge' && r.match && r.name)
  const skipCount = rows.length - newRows.length - mergeRows.length
  const dupCount = rows.filter((r) => r.match).length

  const commit = async () => {
    if (newRows.length === 0 && mergeRows.length === 0) {
      toast.show('처리할 행이 없습니다.', 'warning')
      return
    }
    setBusy(true)
    try {
      const batchId = await createUploadBatch({
        filename: fileName,
        contentHash: fileHash,
        total: rows.length,
        inserted: newRows.length,
        merged: mergeRows.length,
        skipped: skipCount,
      })
      const touched = new Set<EntityKey>()

      // 신규 등록: 구분별로 분산 insert 후 업로드 기여 기록.
      const byTable = new Map<EntityKey, Record<string, unknown>[]>()
      for (const r of newRows) {
        const { target, payload } = rowToPayload(r, r.categoryLabel)
        const list = byTable.get(target) ?? []
        list.push(payload)
        byTable.set(target, list)
      }
      for (const [table, list] of byTable) {
        const { data, error } = await supabase.from(table).insert(list).select('id')
        if (error) throw error
        touched.add(table)
        const ids = ((data ?? []) as { id: string }[]).map((d) => d.id)
        await Promise.all(
          ids.map((id) => recordContribution({ table, id, action: 'created', source: 'upload', batchId })),
        )
      }

      // 합치기: 기존 레코드 빈 필드 보강 + 기여 기록(비파괴).
      for (const r of mergeRows) {
        if (!r.match) continue
        const patch = buildEnrichment(r.match, r)
        if (patch) {
          const { error } = await supabase.from(r.match.table).update(patch).eq('id', r.match.id)
          if (error) throw error
        }
        touched.add(r.match.table)
        await recordContribution({
          table: r.match.table,
          id: r.match.id,
          action: patch ? 'enriched' : 'merged',
          source: 'upload',
          batchId,
          note: patch ? '업로드 병합·보강' : '업로드 재유입',
        })
      }

      for (const table of touched) await qc.invalidateQueries({ queryKey: ['networks', table] })
      toast.show(
        `업로드 완료 — 신규 ${newRows.length} · 합치기 ${mergeRows.length} · 건너뜀 ${skipCount}`,
        'success',
      )
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
          CSV를 올리면 각 행의 <b>구분</b>에 맞춰 등록됩니다. 구분이 없으면 미분류로, 기존 인물과
          같으면 <b>합치기</b>로 이력을 이어붙입니다.
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
              <Badge tone="success" size="sm">신규 {newRows.length}</Badge>
              {mergeRows.length > 0 && <Badge tone="info" size="sm">합치기 {mergeRows.length}</Badge>}
              {skipCount > 0 && <Badge tone="neutral" size="sm">건너뜀 {skipCount}</Badge>}
              {checking && <span className="text-gray-400">중복 검사 중…</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} disabled={busy}>
                다시 선택
              </Button>
              <Button onClick={() => void commit()} disabled={busy || checking}>
                최종 업로드 ({newRows.length + mergeRows.length})
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
            <Banner tone="info">
              파랗게 표시된 <b>{dupCount}건</b>은 기존 인물(이메일·전화 일치)과 같습니다. 기본 <b>합치기</b>
              (기존 레코드에 빈 값 보강 + 이력 추가)로 처리되며, 다른 인물이면 <b>신규 등록</b>으로 바꾸세요.
            </Banner>
          )}

          <div className="overflow-x-auto rounded-radius-lg border border-gray-200">
            <table className="w-full text-caption">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {['결정', '이름', '소속', '부서', '직책', '이메일', '연락처', '구분', '중복'].map((h) => (
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
                      r.match && 'bg-info-subtle',
                      (!r.name || r.decision === 'skip') && 'opacity-50',
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <InlineSelect
                        value={r.decision}
                        disabled={!r.name}
                        onChange={(e) => setDecision(r.line, e.target.value as Decision)}
                      >
                        {decisionOptions(Boolean(r.match)).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </InlineSelect>
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
                        disabled={r.decision === 'merge'}
                        onChange={(e) => setCategory(r.line, e.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((o) => (
                          <option key={o.key} value={o.label}>{o.label}</option>
                        ))}
                      </InlineSelect>
                    </td>
                    <td className="px-3 py-1.5">
                      {r.match ? (
                        <span className="inline-flex items-center gap-1">
                          <Badge tone="info" size="sm">중복</Badge>
                          <span className="text-gray-500">
                            → {r.match.name} ({ENTITIES[r.match.table].label})
                          </span>
                        </span>
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
