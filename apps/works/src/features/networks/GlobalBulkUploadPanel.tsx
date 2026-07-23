import { Badge, Banner, Button, cn, Modal, Select, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type DragEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useTags } from '@/features/admin/hooks'
import { createUploadBatch, findPriorBatchByHash } from '@/features/networks/hooks'
import { downloadCsv, sha256Hex } from '@/features/networks/bulkUpload'
import {
  GLOBAL_CATEGORY_OPTIONS,
  GLOBAL_TABLE,
  REGION_TAG_TABLE,
  COUNTRY_TAG_TABLE,
  type GlobalCategory,
} from '@/features/networks/globalConfig'
import {
  buildGlobalEnrichment,
  buildGlobalTemplateCsv,
  findGlobalMatches,
  normalizeGlobalCategory,
  parseGlobalBulkCsv,
  rowToGlobalPayload,
  type GlobalExistingRef,
  type TagResolver,
} from '@/features/networks/globalBulkUpload'
import {
  GlobalBulkReviewTable,
  type Decision,
  type GlobalReviewRow,
} from '@/features/networks/GlobalBulkReviewTable'

const isValidCategory = (v: string | null | undefined): v is GlobalCategory =>
  GLOBAL_CATEGORY_OPTIONS.includes((v ?? '') as GlobalCategory)

/** 중복 매칭 시 구분 프리셋: 기존이 유효 구분이면 보수적으로 기존을, 아니면 CSV 구분을 쓴다. */
function presetCategory(csvCategory: GlobalCategory | '', match: GlobalExistingRef): GlobalCategory | '' {
  return isValidCategory(match.category) ? match.category : csvCategory
}

/**
 * 글로벌 대용량 업로드. 드래그앤드랍 → 리뷰(구분·중복·결정) → 업로드.
 * 국내 9종과 달리 단일 마스터(global_networks)라 재분류 이관이 없고, 구분은 스칼라(기업/기관/투자자)이며
 * 권역·국가는 CSV의 이름을 태그(region_tags/country_tags)로 매칭해 저장한다.
 */
export function GlobalBulkUploadPanel() {
  const toast = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<GlobalReviewRow[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [revivedLines, setRevivedLines] = useState<number[]>([])
  const [reviveConfirm, setReviveConfirm] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [priorUpload, setPriorUpload] = useState<{ filename: string | null; created_at: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)

  // 권역·국가 이름 → 태그 id 매핑(대소문자·공백 무시). CSV의 이름 입력을 FK로 해석한다.
  const regions = useTags(REGION_TAG_TABLE)
  const countries = useTags(COUNTRY_TAG_TABLE, 'region_tag_id')
  const tags: TagResolver = useMemo(() => {
    const norm = (v: string) => v.trim().toLowerCase()
    const regionMap = new Map((regions.data ?? []).map((t) => [norm(t.name), t.id]))
    const countryMap = new Map((countries.data ?? []).map((t) => [norm(t.name), t.id]))
    return {
      region: (name) => regionMap.get(norm(name)) ?? null,
      country: (name) => countryMap.get(norm(name)) ?? null,
    }
  }, [regions.data, countries.data])

  const loadFile = async (file: File) => {
    const text = await file.text()
    const parsed = parseGlobalBulkCsv(text)
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
        categoryLabel: normalizeGlobalCategory(r.category),
        match: null,
        decision: r.name ? 'new' : 'skip',
      })),
    )

    setChecking(true)
    try {
      const matches = await findGlobalMatches(
        parsed.map((r) => ({ line: r.line, name: r.name, email: r.email, phone: r.phone })),
      )
      setRows((prev) =>
        prev.map((r) => {
          const m = matches.get(r.line)
          if (!m) return r
          return {
            ...r,
            match: m,
            decision: !r.name ? 'skip' : m.deleted ? 'skip' : 'merge',
            categoryLabel: presetCategory(normalizeGlobalCategory(r.category), m),
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

  const setCategory = (line: number, label: GlobalCategory | '') =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, categoryLabel: label } : r)))
  const setDecision = (line: number, decision: Decision) =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, decision } : r)))
  const applyBulkDecision = (d: Decision) =>
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.includes(r.line)) return r
        if (d === 'merge' && !(r.match && !r.match.deleted)) return r
        return { ...r, decision: d }
      }),
    )
  const applyBulkCategory = (label: GlobalCategory | '') =>
    setRows((prev) => prev.map((r) => (selected.includes(r.line) ? { ...r, categoryLabel: label } : r)))

  const applyRevive = (line: number) => {
    setRevivedLines((prev) => (prev.includes(line) ? prev : [...prev, line]))
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, decision: 'merge' } : r)))
    setReviveConfirm(null)
  }
  const reset = () => {
    setRows([])
    setSelected([])
    setRevivedLines([])
    setFileName('')
    setFileHash('')
    setPriorUpload(null)
  }

  const newRows = rows.filter((r) => r.decision === 'new' && r.name)
  const mergeRows = rows.filter(
    (r) =>
      r.decision === 'merge' &&
      r.match &&
      r.name &&
      (!r.match.deleted || revivedLines.includes(r.line)),
  )
  const skipCount = rows.length - newRows.length - mergeRows.length
  const dupCount = rows.filter((r) => r.match).length
  const deletedPending = rows.filter((r) => r.match?.deleted && !revivedLines.includes(r.line)).length
  const displaySkip = skipCount - deletedPending

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

      // 신규 등록 — 단일 마스터라 한 번의 RPC 호출로 배치 삽입한다.
      if (newRows.length > 0) {
        const payloads = newRows.map((r) => rowToGlobalPayload(r, r.categoryLabel, tags))
        const { error } = await supabase.rpc('upload_insert_entities', {
          p_table: GLOBAL_TABLE,
          p_rows: payloads,
          p_batch_id: batchId,
        })
        if (error) throw error
      }

      // 합치기 — 제자리 보강(구분 변경 포함). 비활성 매칭이면 재활성화(deleted_at=null).
      for (const r of mergeRows) {
        if (!r.match) continue
        const patch = buildGlobalEnrichment(r.match, r, r.categoryLabel, tags) ?? {}
        const values = r.match.deleted ? { deleted_at: null, ...patch } : patch
        const { error } = await supabase.rpc('upload_enrich_entity', {
          p_table: GLOBAL_TABLE,
          p_id: r.match.id,
          p_values: values,
          p_batch_id: batchId,
          p_note: r.match.deleted
            ? '재업로드 복구·병합'
            : Object.keys(patch).length
              ? '업로드 병합·보강'
              : '업로드 재유입',
        })
        if (error) throw error
      }

      await qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] })
      toast.show(
        `업로드 완료 — 신규 ${newRows.length} · 합치기 ${mergeRows.length} · 미업로드 ${displaySkip}`,
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
          CSV를 올리면 <b>글로벌 네트워크</b>로 등록됩니다. 기존 인물과 같으면 <b>합치기</b>로 이력을
          이어붙이고, 권역·국가는 이름으로 적으면 태그로 매칭됩니다(못 찾으면 비워 둡니다).
        </p>
        <Button variant="outline" onClick={() => downloadCsv('글로벌네트워크_업로드_템플릿.csv', buildGlobalTemplateCsv())}>
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
          <span className="text-caption text-gray-600">.csv (UTF-8)</span>
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
              <Badge tone="neutral">전체 {rows.length}</Badge>
              <Badge tone="success">신규 {newRows.length}</Badge>
              {mergeRows.length > 0 && <Badge tone="info">합치기 {mergeRows.length}</Badge>}
              {deletedPending > 0 && <Badge tone="warning">비활성 {deletedPending}</Badge>}
              {displaySkip > 0 && <Badge tone="neutral">미업로드 {displaySkip}</Badge>}
              {dupCount > 0 && <span className="text-gray-600">중복 {dupCount}</span>}
              {checking && <span className="text-gray-600">중복 검사 중…</span>}
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
                <Select
                  value=""
                  onChange={(e) => e.target.value && applyBulkDecision(e.target.value as Decision)}
                >
                  <option value="">결정 일괄</option>
                  <option value="merge">합치기</option>
                  <option value="new">신규 등록</option>
                  <option value="skip">미업로드</option>
                </Select>
              </div>
              <div className="w-32">
                <Select value="" onChange={(e) => applyBulkCategory(e.target.value as GlobalCategory | '')}>
                  <option value="">구분 일괄</option>
                  {GLOBAL_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" onClick={() => setSelected([])}>선택 해제</Button>
            </div>
          )}

          <GlobalBulkReviewTable
            rows={rows}
            selected={selected}
            revivedLines={revivedLines}
            busy={busy}
            onSelectionChange={setSelected}
            onCategory={setCategory}
            onDecision={setDecision}
            onRevive={(line) => setReviveConfirm(line)}
          />

          <Modal
            open={reviveConfirm !== null}
            onClose={() => setReviveConfirm(null)}
            title="복구 확인"
            size="sm"
            footer={
              <>
                <Button variant="secondary" onClick={() => setReviveConfirm(null)}>아니오</Button>
                <Button onClick={() => reviveConfirm !== null && applyRevive(reviveConfirm)}>네, 복구</Button>
              </>
            }
          >
            <p className="text-body text-gray-700">
              비활성화된 데이터입니다. 정말 복구하시겠습니까?
            </p>
          </Modal>
        </>
      )}
    </div>
  )
}
