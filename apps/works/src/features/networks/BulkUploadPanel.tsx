import { Badge, Banner, Button, cn, InlineSelect, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type DragEvent } from 'react'
import { supabase } from '@/lib/supabase'
import {
  CATEGORY_OPTIONS,
  ENTITIES,
  resolveEntityFromCategory,
  type EntityKey,
} from '@/features/networks/config'
import {
  createUploadBatch,
  findPriorBatchByHash,
  mergeReclassify,
  recordContribution,
} from '@/features/networks/hooks'
import {
  buildEnrichment,
  buildReclassifyValues,
  buildTemplateCsv,
  downloadCsv,
  findExistingMatches,
  parseBulkCsv,
  rowToPayload,
  sha256Hex,
  type ExistingRef,
} from '@/features/networks/bulkUpload'
import { BulkReviewTable, type Decision, type ReviewRow } from '@/features/networks/BulkReviewTable'

const MISC_LABEL = '미분류'
const CATEGORY_SELECT = CATEGORY_OPTIONS.map((o) => ({ value: o.label, label: o.label }))

function normalizeCategory(raw: string): string {
  return CATEGORY_OPTIONS.find((o) => o.label === raw.trim())?.label ?? MISC_LABEL
}

/** 중복 매칭 시 구분 재결정의 프리셋: 미분류 매칭이면 CSV 구분, 실카테고리 매칭이면 기존 구분(보수적). */
function presetCategory(csvCategory: string, match: ExistingRef): string {
  return match.table === 'others' ? csvCategory : match.category
}

/**
 * 대용량 업로드(미분류 데이터베이스 하위). 드래그앤드랍 → 리뷰(구분 재결정·중복·결정) → 업로드.
 * 합치기+같은구분=보강, 합치기+다른구분=재분류 이관+보강, 신규=새 등록, 건너뛰기=무시.
 */
export function BulkUploadPanel() {
  const toast = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [revivedLines, setRevivedLines] = useState<number[]>([])
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
    setSelected([])
    setRevivedLines([])
    const hash = await sha256Hex(text)
    setFileHash(hash)
    setPriorUpload(await findPriorBatchByHash(hash))

    setRows(
      parsed.map((r) => ({
        ...r,
        categoryLabel: normalizeCategory(r.category),
        match: null,
        decision: r.name ? 'new' : 'skip',
      })),
    )

    setChecking(true)
    try {
      const matches = await findExistingMatches(
        parsed.map((r) => ({ line: r.line, email: r.email, phone: r.phone })),
      )
      setRows((prev) =>
        prev.map((r) => {
          const m = matches.get(r.line)
          if (!m) return r
          return {
            ...r,
            match: m,
            // 비활성 중복은 기본 건너뛰기(보수적) — 복구는 명시적으로 선택.
            decision: !r.name ? 'skip' : m.deleted ? 'skip' : 'merge',
            categoryLabel: presetCategory(normalizeCategory(r.category), m),
          }
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
  const toggle = (line: number) =>
    setSelected((prev) => (prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]))
  const toggleAll = () => {
    const lines = rows.filter((r) => r.name).map((r) => r.line)
    setSelected((prev) => (prev.length >= lines.length ? [] : lines))
  }
  const applyBulkDecision = (d: Decision) =>
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.includes(r.line)) return r
        // 합치기는 활성 중복만 유효(비활성은 행별 복구 버튼으로 처리).
        if (d === 'merge' && !(r.match && !r.match.deleted)) return r
        return { ...r, decision: d }
      }),
    )

  // 비활성 매칭 행 즉시 복구(활성화 + 빈 필드 보강 + 기여 기록).
  const onRevive = async (line: number) => {
    const row = rows.find((r) => r.line === line)
    if (!row?.match) return
    const match = row.match
    setBusy(true)
    try {
      const patch = buildEnrichment(match, row) ?? {}
      const { error } = await supabase
        .from(match.table)
        .update({ deleted_at: null, ...patch })
        .eq('id', match.id)
      if (error) throw error
      await recordContribution({
        table: match.table,
        id: match.id,
        action: 'enriched',
        source: 'upload',
        note: '재업로드 복구',
      })
      await qc.invalidateQueries({ queryKey: ['networks', match.table] })
      setRevivedLines((prev) => [...prev, line])
      toast.show(`${match.name}을(를) 복구했습니다.`, 'success')
    } catch {
      toast.show('복구에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }
  const applyBulkCategory = (label: string) =>
    setRows((prev) => prev.map((r) => (selected.includes(r.line) ? { ...r, categoryLabel: label } : r)))
  const reset = () => {
    setRows([])
    setSelected([])
    setRevivedLines([])
    setFileName('')
    setFileHash('')
    setPriorUpload(null)
  }

  const newRows = rows.filter((r) => r.decision === 'new' && r.name)
  const mergeRows = rows.filter((r) => r.decision === 'merge' && r.match && !r.match.deleted && r.name)
  const skipCount = rows.length - newRows.length - mergeRows.length
  const dupCount = rows.filter((r) => r.match).length
  // 비활성(soft-delete) 매칭 건수 — '복구하기' 대상. 건너뜀 표시에서 분리한다.
  const deletedCount = rows.filter((r) => r.match?.deleted).length
  const displaySkip = skipCount - deletedCount

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

      // 신규 등록.
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

      // 합치기: 같은 구분이면 제자리 보강, 다른 구분이면 재분류 이관.
      for (const r of mergeRows) {
        if (!r.match) continue
        const target = resolveEntityFromCategory(r.categoryLabel)
        if (target === r.match.table) {
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
        } else {
          const values = buildReclassifyValues(r.match, r, ENTITIES[target].label)
          await mergeReclassify({ from: r.match.table, fromId: r.match.id, to: target, values, batchId })
          touched.add(r.match.table)
          touched.add(target)
        }
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
          CSV를 올리면 각 행의 <b>구분</b>에 맞춰 등록됩니다. 기존 인물과 같으면 <b>합치기</b>로
          이력을 이어붙이고, 구분을 바꾸면 그 네트워크로 재분류됩니다.
        </p>
        <Button variant="outline" onClick={() => downloadCsv('네트워크_업로드_템플릿.csv', buildTemplateCsv())}>
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
              {deletedCount > 0 && <Badge tone="warning" size="sm">비활성 {deletedCount}</Badge>}
              {revivedLines.length > 0 && <Badge tone="success" size="sm">복구됨 {revivedLines.length}</Badge>}
              {displaySkip > 0 && <Badge tone="neutral" size="sm">건너뜀 {displaySkip}</Badge>}
              {dupCount > 0 && <span className="text-gray-400">중복 {dupCount}</span>}
              {checking && <span className="text-gray-400">중복 검사 중…</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} disabled={busy}>다시 선택</Button>
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

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-caption font-medium text-gray-700">선택 {selected.length}건</span>
              <div className="w-32">
                <InlineSelect
                  value=""
                  onChange={(e) => e.target.value && applyBulkDecision(e.target.value as Decision)}
                >
                  <option value="">결정 일괄</option>
                  <option value="merge">합치기</option>
                  <option value="new">신규 등록</option>
                  <option value="skip">건너뛰기</option>
                </InlineSelect>
              </div>
              <div className="w-32">
                <InlineSelect value="" onChange={(e) => e.target.value && applyBulkCategory(e.target.value)}>
                  <option value="">구분 일괄</option>
                  {CATEGORY_SELECT.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </InlineSelect>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setSelected([])}>선택 해제</Button>
            </div>
          )}

          <BulkReviewTable
            rows={rows}
            categoryOptions={CATEGORY_SELECT}
            selected={selected}
            revivedLines={revivedLines}
            busy={busy}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onCategory={setCategory}
            onDecision={setDecision}
            onRevive={(line) => void onRevive(line)}
          />
        </>
      )}
    </div>
  )
}
