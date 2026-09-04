import {
  Badge,
  Banner,
  Button,
  cn,
  Modal,
  Select,
  Tooltip,
  tooltipScale,
  useToast,
} from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type DragEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useTags } from '@/features/admin/hooks'
import { CATEGORY_OPTIONS, NETWORK_TABLE, type NetworkCategory } from '@/features/networks/config'
import { useCountryOptions } from '@/features/networks/countryOptions'
import { createUploadBatch, findPriorBatchByHash } from '@/features/networks/hooks'
import {
  buildEnrichment,
  csvCategory,
  buildTemplateCsv,
  downloadCsv,
  findExistingMatches,
  parseBulkCsv,
  rowToPayload,
  sha256Hex,
  type ExistingRef,
} from '@/features/networks/bulkUpload'
import { BulkReviewTable, type Decision, type ReviewRow } from '@/features/networks/BulkReviewTable'

// 선택지 값은 저장되는 코드 그대로다. 빈 값은 미분류(구분을 정하지 않고 올린다).
const CATEGORY_SELECT = [
  { value: '', label: '미분류' },
  ...CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
]

/**
 * 중복 매칭 시 구분 재결정의 프리셋: 기존이 미분류면 CSV 구분, 이미 구분이 있으면 기존 값(보수적).
 * 통합 원장에서는 구분이 한 칸의 값이라 이 선택이 행 이동을 뜻하지 않는다.
 */
function presetCategory(fromCsv: NetworkCategory | null, match: ExistingRef): NetworkCategory | '' {
  return (match.category ?? fromCsv ?? '') as NetworkCategory | ''
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
  // 복구 확인 모달 대상 행(열림 = 값 존재).
  const [reviveConfirm, setReviveConfirm] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [priorUpload, setPriorUpload] = useState<{ filename: string | null; created_at: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  // 영역은 ADMIN 영역 관리(field_tags)에서 고르는 값이다. 파일의 값은 그대로 저장하되,
  // 원장에 없는 이름은 목록 필터에 걸리지 않으므로 올리기 전에 드러낸다(조용히 버리지 않는다).
  const { data: fieldTags } = useTags('field_tags')
  // 국가는 이름으로 올라오므로 태그 원장과 대조해 id로 바꾼다(대소문자·공백 무시).
  // 못 찾은 값은 버리지 않고 '미확인'으로 남겨 목록에서 채우게 한다.
  const { data: countries } = useCountryOptions()
  const countryByName = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>()
    for (const c of [...(countries?.domestic ?? []), ...(countries?.overseas ?? [])]) {
      m.set(c.name.trim().toLowerCase(), { id: c.id, name: c.name })
    }
    return m
  }, [countries])
  const unknownFields = useMemo(() => {
    const known = new Set((fieldTags ?? []).map((t) => t.name))
    const out = new Set<string>()
    for (const r of rows) for (const f of r.expertise) if (!known.has(f)) out.add(f)
    return [...out]
  }, [rows, fieldTags])

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
      parsed.map((r) => {
        const hit = countryByName.get(r.country.trim().toLowerCase())
        return {
          ...r,
          targetCategory: (csvCategory(r.category) ?? '') as NetworkCategory | '',
          countryTagId: hit?.id ?? null,
          countryLabel: hit?.name ?? r.country.trim(),
          match: null,
          decision: r.name ? 'new' : 'skip',
        }
      }),
    )

    setChecking(true)
    try {
      const matches = await findExistingMatches(
        parsed.map((r) => ({ line: r.line, name: r.name, email: r.email, phone: r.phone })),
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
            targetCategory: presetCategory(csvCategory(r.category), m),
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

  const setCategory = (line: number, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.line === line ? { ...r, targetCategory: value as NetworkCategory | '' } : r)),
    )
  const setDecision = (line: number, decision: Decision) =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, decision } : r)))
  const applyBulkDecision = (d: Decision) =>
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.includes(r.line)) return r
        // 합치기는 활성 중복만 유효(비활성은 행별 복구 버튼으로 처리).
        if (d === 'merge' && !(r.match && !r.match.deleted)) return r
        return { ...r, decision: d }
      }),
    )

  // 복구하기: 확인 모달에서 '네'를 눌러야 '복구 예정'으로 바뀐다(즉시 활성화하지 않음).
  // 이후 다른 중복처럼 결정(합치기/미업로드)을 고르게 하며, 실제 재활성화는 최종 업로드 시 합치기일 때만 일어난다.
  const applyRevive = (line: number) => {
    setRevivedLines((prev) => (prev.includes(line) ? prev : [...prev, line]))
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, decision: 'merge' } : r)))
    setReviveConfirm(null)
  }
  const applyBulkCategory = (value: string) =>
    setRows((prev) =>
      prev.map((r) =>
        selected.includes(r.line) ? { ...r, targetCategory: value as NetworkCategory | '' } : r,
      ),
    )
  const reset = () => {
    setRows([])
    setSelected([])
    setRevivedLines([])
    setFileName('')
    setFileHash('')
    setPriorUpload(null)
  }

  const newRows = rows.filter((r) => r.decision === 'new' && r.name)
  // 합치기 대상: 활성 매칭 + 복구 예정(비활성이지만 복구하기를 누른) 매칭.
  const mergeRows = rows.filter(
    (r) =>
      r.decision === 'merge' &&
      r.match &&
      r.name &&
      (!r.match.deleted || revivedLines.includes(r.line)),
  )
  const skipCount = rows.length - newRows.length - mergeRows.length
  const dupCount = rows.filter((r) => r.match).length
  // 아직 복구하기를 누르지 않은 비활성 매칭 — 미업로드(건너뜀) 표시에서 분리해 별도 노출.
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
      // 신규 등록. 원장이 하나라 대상별로 나눌 필요가 없다 — 한 번에 밀어 넣는다.
      // 등록과 이력을 한 트랜잭션에 넣는다(종전에는 insert 후 행마다 기여 로그를 따로
      // 밀어 넣어, 앞은 성공하고 뒤가 실패하면 배치 표식 없는 행이 남을 수 있었다).
      if (newRows.length > 0) {
        const { error } = await supabase.rpc('upload_insert_entities', {
          p_table: NETWORK_TABLE,
          p_rows: newRows.map((r) =>
            rowToPayload(r, (r.targetCategory || null) as NetworkCategory | null, r.countryTagId),
          ),
          p_batch_id: batchId,
        })
        if (error) throw error
      }

      // 합치기: 제자리 보강. 구분·국가가 바뀌었으면 같은 보강에 함께 실린다 —
      // 통합 원장에서 구분 변경은 행 이동이 아니라 한 칸 수정이라, 종전의 '재분류 이관'
      // (대상 등록 + 원본 비활성화)이 통째로 사라졌다. id가 그대로이므로 그 레코드에 붙어
      // 있던 자료·피드백·회의록 링크도 끊기지 않는다.
      // 비활성 매칭을 합치기로 처리하면 이때 재활성화(deleted_at=null)한다.
      for (const r of mergeRows) {
        if (!r.match) continue
        const patch =
          buildEnrichment(r.match, r, {
            category: (r.targetCategory || null) as NetworkCategory | null,
            countryTagId: r.countryTagId,
          }) ?? {}
        const values = r.match.deleted ? { deleted_at: null, ...patch } : patch
        // 보강할 값이 없는 '재유입'은 원장이 바뀌지 않으므로 RPC가 기록만 남긴다.
        const { error } = await supabase.rpc('upload_enrich_entity', {
          p_table: NETWORK_TABLE,
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

      await qc.invalidateQueries({ queryKey: ['networks'] })
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
        {/* 무엇을 하는 화면인지는 남기고, 중복·재분류가 어떻게 처리되는지의 규칙만 접는다. */}
        <p className="flex items-center text-body text-gray-600">
          CSV를 올리면 각 행의 <b className="mx-1">구분</b>에 맞춰 등록됩니다.
          <Tooltip
            label="CSV 업로드 규칙"
            content={
              '기존 인물과 같으면 합치기로 이력을 이어붙입니다.\n구분을 바꾸면 그 네트워크로 재분류됩니다.'
            }
            className={tooltipScale.gap}
          />
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

          {unknownFields.length > 0 && (
            <Banner tone="warning">
              ADMIN 영역 관리에 없는 영역이 있습니다 — <b>{unknownFields.join(', ')}</b>. 이대로 올리면
              값은 저장되지만 목록의 영역 필터에는 걸리지 않습니다. 필요하면 먼저 영역을 등록하세요.
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
                <Select value="" onChange={(e) => e.target.value && applyBulkCategory(e.target.value)}>
                  <option value="">구분 일괄</option>
                  {CATEGORY_SELECT.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" onClick={() => setSelected([])}>선택 해제</Button>
            </div>
          )}

          <BulkReviewTable
            rows={rows}
            categoryOptions={CATEGORY_SELECT}
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
