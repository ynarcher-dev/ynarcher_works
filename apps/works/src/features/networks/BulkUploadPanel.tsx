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
import { isInternalPerson, isOrgLikeName, suggestCategory } from '@/features/networks/categoryRules'
import { useCountryOptions } from '@/features/networks/countryOptions'
import { createUploadBatch, findPriorBatchByHash } from '@/features/networks/hooks'
import {
  buildEnrichment,
  csvCategory,
  buildTemplateCsv,
  downloadCsv,
  findExistingMatches,
  foldFileDuplicates,
  guessCountryName,
  parseBulkCsv,
  rowToPayload,
  sha256Hex,
  type ExistingRef,
} from '@/features/networks/bulkUpload'
import { BulkReviewTable, type Decision, type ReviewRow } from '@/features/networks/BulkReviewTable'

/**
 * 구분 선택지. 첫 줄은 **'미지정'이라는 답**이지 빈 자리가 아니다 — 아직 고르지 않은 상태가
 * 아니라 고르지 않기로 한 상태이며, 저장되는 것은 여전히 `null`이다(신규 등록 폼이
 * 2026-09-05에 먼저 밟은 길).
 *
 * 종전에는 이 자리가 '구분 선택'이었고 빈 칸이 하나라도 남으면 업로드가 막혔다. 그 문의
 * 전제는 *빈 칸 = 추천이 할 말이 없었으니 사람이 정하라* 였는데, 추천이 기타로 떨어지게 된
 * 지금(2026-09-10) 그 상태는 **소속도 회사 도메인도 없는 줄**에만 남는다. 그런 줄은 파일을
 * 다시 들여다봐도 답이 나오지 않으므로, 거기서 막는 것은 결정을 얻는 것이 아니라 업로드를
 * 잃는 것이다.
 */
const CATEGORY_SELECT = [
  { value: '', label: '미지정' },
  ...CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
]

/**
 * 중복 매칭 시 구분 재결정의 프리셋: 기존 구분이 있으면 그 값(보수적), 없으면 파일에서 온 값.
 * 통합 원장에서는 구분이 한 칸의 값이라 이 선택이 행 이동을 뜻하지 않는다.
 */
function presetCategory(fromCsv: NetworkCategory | null, match: ExistingRef): NetworkCategory | '' {
  return (match.category ?? fromCsv ?? '') as NetworkCategory | ''
}

/**
 * 대용량 업로드(네트워크 목록 상단 버튼으로 진입). 드래그앤드랍 → 리뷰(구분 확정·중복·결정) → 업로드.
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
    // 같은 파일 안의 중복을 먼저 접는다 — 원장 대조는 업로드 전에 한 번 돌므로, 접지 않으면
    // 한 사람의 명함 두 장이 서로를 모른 채 두 행으로 등록된다.
    const parsed = foldFileDuplicates(parseBulkCsv(text))
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
        // 국가 열이 없는 파일(명함첩)에서는 연락처가 대신 답한다. 파일이 적어 낸 값이 언제나 먼저다.
        const countryName = r.country.trim() || guessCountryName(r.phone)
        const hit = countryByName.get(countryName.toLowerCase())
        const internal = isInternalPerson(r.affiliation, r.email)
        const orgLikeName = isOrgLikeName(r.name)
        return {
          ...r,
          // 파일에 구분이 없으면 소속·이메일 도메인으로 추천해 미리 채운다 — 사람이 고쳐 쓰는
          // 출발점이지 확정이 아니다. 소속을 짐작할 근거가 하나도 없는 줄만 '미지정'으로 선다.
          targetCategory: (csvCategory(r.category) ??
            suggestCategory(r.affiliation, r.email) ??
            '') as NetworkCategory | '',
          countryTagId: hit?.id ?? null,
          countryLabel: hit?.name ?? countryName,
          internal,
          orgLikeName,
          match: null,
          // 자사 사람과 조직 명함은 기본값이 건너뛰기다. 자사는 되돌릴 수 없고(정책),
          // 조직명은 되돌릴 수 있다(의심일 뿐이다).
          decision: !r.name || internal || orgLikeName ? 'skip' : 'new',
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
            decision:
              !r.name || r.internal || r.orgLikeName ? 'skip' : m.deleted ? 'skip' : 'merge',
            targetCategory: presetCategory(
              csvCategory(r.category) ?? suggestCategory(r.affiliation, r.email),
              m,
            ),
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
  // 자사 행은 결정을 바꿀 수 없다 — 추천이 아니라 정책이라 되돌릴 자리를 두지 않는다.
  const setDecision = (line: number, decision: Decision) =>
    setRows((prev) => prev.map((r) => (r.line === line && !r.internal ? { ...r, decision } : r)))
  const applyBulkDecision = (d: Decision) =>
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.includes(r.line) || r.internal) return r
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

  const newRows = rows.filter((r) => r.decision === 'new' && r.name && !r.internal)
  // 합치기 대상: 활성 매칭 + 복구 예정(비활성이지만 복구하기를 누른) 매칭.
  const mergeRows = rows.filter(
    (r) =>
      r.decision === 'merge' &&
      r.match &&
      r.name &&
      !r.internal &&
      (!r.match.deleted || revivedLines.includes(r.line)),
  )
  const skipCount = rows.length - newRows.length - mergeRows.length
  const dupCount = rows.filter((r) => r.match).length
  // 아직 복구하기를 누르지 않은 비활성 매칭 — 미업로드(건너뜀) 표시에서 분리해 별도 노출.
  const deletedPending = rows.filter((r) => r.match?.deleted && !revivedLines.includes(r.line)).length
  const displaySkip = skipCount - deletedPending
  // 화면이 밝혀야 하는 자동 처리 넷 — 조용히 사라지거나 조용히 바뀌는 행이 없어야 한다.
  const internalCount = rows.filter((r) => r.internal).length
  const orgNameCount = rows.filter((r) => r.orgLikeName && !r.internal).length
  const foldedCount = rows.reduce((sum, r) => sum + r.foldedLines.length, 0)
  const corruptCount = rows.filter((r) => r.phoneCorrupt).length
  // 올라가는 행 중 구분이 빈 것 — 막지 않고 '미지정'으로 들어간다(위 CATEGORY_SELECT 주석).
  const unsetCategory = [...newRows, ...mergeRows].filter((r) => !r.targetCategory).length

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
          <span className="text-caption text-gray-600">
            .csv (UTF-8) · 리멤버 명함첩에서 내려받은 파일을 그대로 올릴 수 있습니다
          </span>
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

          {/* 파일을 읽으며 화면이 대신 판단한 것들. 되돌릴 자리가 있는지까지 함께 말한다. */}
          {(internalCount > 0 || orgNameCount > 0 || foldedCount > 0 || corruptCount > 0) && (
            <Banner tone="info">
              {internalCount > 0 && (
                <>
                  자사 임직원 <b>{internalCount}건</b>은 제외했습니다 — 이 원장이 담는 것은 회사 밖
                  사람입니다.{' '}
                </>
              )}
              {orgNameCount > 0 && (
                <>
                  이름 칸이 조직명으로 보이는 <b>{orgNameCount}건</b>은 건너뛰기로 두었습니다. 사람이
                  맞으면 그 행의 결정을 바꾸십시오.{' '}
                </>
              )}
              {foldedCount > 0 && (
                <>
                  같은 파일 안에서 겹친 <b>{foldedCount}건</b>은 한 줄로 접었습니다.{' '}
                </>
              )}
              {corruptCount > 0 && (
                <>
                  엑셀이 망가뜨린 번호 <b>{corruptCount}건</b>은 연락처를 비웠습니다. 리멤버에서 받은
                  원본 CSV를 엑셀로 열어 저장하지 마십시오.
                </>
              )}
            </Banner>
          )}

          {unsetCategory > 0 && (
            <Banner tone="warning">
              구분을 짐작할 소속이 없어 <b>{unsetCategory}건</b>이 미지정으로 올라갑니다. 목록의 구분
              필터 '미지정'에서 다시 찾아 채울 수 있습니다.
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
