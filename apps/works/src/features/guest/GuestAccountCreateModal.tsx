import {
  BackButton,
  Banner,
  Button,
  DetailTopBar,
  IconButton,
  Input,
  MiniPager,
  Modal,
  PageHeader,
  TextAction,
  cn,
  useToast,
} from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { hasWorkspaceRead } from '@/auth/authStore'
import type { AuthUser } from '@/auth/types'
import { downloadCsv } from '@/lib/csv'
import { failureText } from '@/lib/failureText'
import {
  LedgerCandidatePickerModal,
  type LedgerCandidate,
} from '@/features/guest/LedgerCandidatePickerModal'
import {
  applyBatchOutcomes,
  buildFailedRowsCsv,
  buildGuestTemplateCsv,
  chunkGuestRows,
  createGuestDraftRow,
  guestRowIssues,
  parseGuestGrid,
  submittableGuestRows,
  toGuestBatchPayload,
  type GuestBatchField,
  type GuestBatchOutcome,
  type GuestBatchSummary,
  type GuestDraftRow,
  type GuestRowIssue,
} from '@/features/guest/guestBatch'
import { createGuestAccountsBatch } from '@/features/guest/guestBatchService'
import { readGuestSheet } from '@/features/guest/guestBatchFile'

/** 줄 격자 — 번호·이름·이메일·연락처·NETWORKS 연결·삭제. 머리글과 각 줄이 같은 값을 쓴다. */
const ROW_GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] gap-2'

/** 입력칸의 사유는 그 칸 바로 아래에 둔다. 행 아래에 한데 모으면 어느 값을 고칠지 다시 찾아야 한다. */
function GuestFieldIssues({ id, issues }: { id: string; issues: readonly GuestRowIssue[] }) {
  if (issues.length === 0) return null
  return (
    <ul id={id} className="space-y-0.5 text-caption text-danger">
      {issues.map((issue) => (
        <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
      ))}
    </ul>
  )
}

const TEMPLATE_NAME = 'guest_accounts_template.csv'
const FAILED_NAME = 'guest_accounts_failed.csv'
/** 대용량 파일도 입력 1만 개를 한 번에 DOM에 올리지 않는다. 검증은 계속 전체 행을 본다. */
const PREVIEW_PAGE_SIZE = 100

/**
 * GUEST 계정 생성 편집기 — 수기 생성 모달과 파일 업로드 전용 페이지가 함께 쓴다.
 *
 * 한 사람씩 열고 닫던 창을 줄 표로 바꾼 것이 이 화면의 전부다. 사업 하나가 열릴 때 만드는
 * 계정은 한 건이 아니라 수십 건이고, 창을 수십 번 여닫는 동안 실패한 건이 어느 것이었는지는
 * 아무 데도 남지 않았다.
 *
 * 세 가지를 지킨다.
 *
 *  · **되는 줄은 된다** — 한 줄이 막혀도 나머지는 만들어진다(줄 단위 독립). 그래서 파일 전체를
 *    고쳐 다시 올릴 일이 없다.
 *  · **된 줄은 다시 보내지 않는다** — 성공한 줄은 표에서 빠지고 실패한 줄만 사유를 달고 남는다.
 *    고쳐서 다시 누르면 남은 줄만 간다.
 *  · **이미 있는 계정과의 중복은 서버가 답한다** — 화면에서 미리 훑으면 읽을 권한이 없는
 *    원장(M&A)에 이미 그 사람이 있다는 사실이 드러난다. 중복 사유도 무엇과 겹쳤는지는 말하지
 *    않는다(`guestBatchService`의 `SAFE_DUPLICATE_TEXT`).
 *
 * 수기 생성 모달에는 파일 선택을 두지 않는다. 대용량 파일은 목록의 `대용량 업로드` 버튼에서
 * `/guest-accounts/bulk`로 들어와 고른다. 판정은 이 파일에 없다 — 검증·중복·결과 반영은
 * `guestBatch`가, 서버 계약은 `guestBatchService`가, 파일 읽기는 `guestBatchFile`이 소유한다.
 */
export function GuestAccountCreateModal({
  open,
  onClose,
  user,
  presentation = 'modal',
}: {
  open: boolean
  onClose: () => void
  user: AuthUser | null
  presentation?: 'modal' | 'bulk-page'
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const location = useLocation()
  const canReadNetworks = hasWorkspaceRead(user, 'networks')
  const [rows, setRows] = useState<GuestDraftRow[]>(() =>
    presentation === 'bulk-page' ? [] : [createGuestDraftRow()],
  )
  const [pickerRowId, setPickerRowId] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [summary, setSummary] = useState<GuestBatchSummary | null>(null)
  const [previewPage, setPreviewPage] = useState(0)

  /**
   * 지금 유효한 파일 읽기의 번호.
   *
   * 큰 XLSX는 여는 데 시간이 걸리고, 그 사이에 창을 닫거나 다른 파일을 고를 수 있다. 번호가
   * 달라진 읽기의 결과는 **버린다** — 버리지 않으면 닫았다 다시 연 창에 먼저 올린 파일의 줄이
   * 뒤늦게 쌓인다. 닫기·보내기를 함께 잠그는 것과 둘 다 둔다: 잠금은 사람의 실수를 막고,
   * 번호는 잠금을 빠져나간 경우(다른 파일 연속 선택)를 막는다.
   */
  const loadSeq = useRef(0)

  /**
   * 표를 건드릴 수 없는 상태 — 보내는 중이거나 파일을 읽는 중.
   *
   * 한 칸이라도 열어 두면 보낸 줄과 화면의 줄이 어긋난다. 보내는 중에 이메일을 고치면 방금
   * 보낸 값이 아닌 값이 결과에 붙고, 파일을 읽는 중에 고치면 곧 들어올 줄과 섞인다.
   */
  const locked = busy || loadingFile
  const issues = useMemo(() => guestRowIssues(rows), [rows])
  const submittable = useMemo(() => submittableGuestRows(rows), [rows])
  const failedRows = useMemo(() => rows.filter((r) => issues.has(r.rowId)), [rows, issues])
  const previewPageCount = Math.max(1, Math.ceil(rows.length / PREVIEW_PAGE_SIZE))
  const visibleRows = useMemo(
    () => rows
      .map((row, index) => ({ row, index }))
      .slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE),
    [rows, previewPage],
  )

  useEffect(() => {
    setPreviewPage((current) => Math.min(current, previewPageCount - 1))
  }, [previewPageCount])

  const reset = () => {
    // 번호를 올려 진행 중인 읽기의 결과를 무효로 만든다.
    loadSeq.current += 1
    setRows(presentation === 'bulk-page' ? [] : [createGuestDraftRow()])
    setPickerRowId(null)
    setNotes([])
    setSummary(null)
    setPreviewPage(0)
  }

  const close = () => {
    if (busy || loadingFile) return
    reset()
    onClose()
  }

  /** 값을 고치면 그 줄의 **직전 서버 사유는 지운다** — 이번에 묻지 않은 답을 붉게 남겨 두지 않는다. */
  const updateRow = (rowId: string, patch: Partial<GuestDraftRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch, serverIssues: [] } : row)),
    )
  }

  const removeRow = (rowId: string) => {
    // 마지막 한 줄은 지우지 않고 비운다 — 표가 통째로 사라지면 다시 '행 추가'를 찾아야 한다.
    setRows((prev) =>
      prev.length <= 1
        ? presentation === 'bulk-page'
          ? []
          : [createGuestDraftRow()]
        : prev.filter((row) => row.rowId !== rowId),
    )
  }

  const pickCandidates = (candidates: LedgerCandidate[]) => {
    const first = candidates[0]
    if (!pickerRowId || !first) return
    const rest = candidates.slice(1)
    setRows((prev) =>
      [
        ...prev.map((row) =>
          row.rowId === pickerRowId
            ? {
                ...row,
                masterTable: first.masterTable,
                masterId: first.id,
                masterName: first.name,
                // 현재 줄에 이미 적은 값은 덮지 않는다. NETWORKS 값이 옛것일 수 있고,
                // 직접 고친 값을 선택 한 번으로 되돌리면 무엇이 최신인지 확인할 길이 없다.
                name: row.name.trim() || (first.loginName ?? first.name),
                email: row.email.trim() || (first.email ?? ''),
                phone: row.phone.trim() || (first.phone ?? ''),
                serverIssues: [],
              }
            : row,
        ),
        // 두 번째 선택부터는 계정 입력 줄을 새로 만든다. 한 GUEST 계정에 여러 NETWORKS
        // 인격을 붙이는 뜻이 아니라, 고른 사람마다 계정 생성 후보 한 줄을 넣는 동작이다.
        ...rest.map((candidate) =>
          createGuestDraftRow({
            name: candidate.loginName ?? candidate.name,
            email: candidate.email ?? '',
            phone: candidate.phone ?? '',
            masterTable: candidate.masterTable,
            masterId: candidate.id,
            masterName: candidate.name,
          }),
        ),
      ],
    )
  }

  const loadFile = async (file: File) => {
    loadSeq.current += 1
    const seq = loadSeq.current
    setLoadingFile(true)
    try {
      const read = await readGuestSheet(file)
      const parsed = parseGuestGrid(read.grid)
      // 읽는 동안 창이 닫혔거나 다른 파일이 올라왔다 — 이 결과는 버린다.
      if (seq !== loadSeq.current) return
      if (parsed.fileIssues.length > 0) {
        setNotes(parsed.fileIssues)
        toast.show(parsed.fileIssues[0]!, 'warning')
        return
      }
      if (parsed.rows.length === 0) {
        toast.show('파일에 계정 줄이 없습니다.', 'warning')
        return
      }
      // 전용 업로드 페이지는 파일 한 장이 작업 단위다. 다른 파일을 고르면 앞 파일을 교체한다.
      // 생성 모달에는 파일 선택 UI가 없지만, 이전 호출부 호환을 위해 병합 규칙은 남겨 둔다.
      setRows((prev) =>
        presentation === 'bulk-page'
          ? parsed.rows
          : [
              ...prev.filter((r) => r.name.trim() || r.email.trim() || r.phone.trim()),
              ...parsed.rows,
            ],
      )
      setSummary(null)
      setPreviewPage(0)
      setNotes(
        [
          `${file.name}${read.sheetName ? `(${read.sheetName} 시트)` : ''}에서 ${parsed.rows.length}줄을 불러왔습니다.`,
          parsed.skipped > 0 ? `빈 줄 ${parsed.skipped}개는 건너뛰었습니다.` : '',
        ].filter(Boolean),
      )
    } catch (error: unknown) {
      if (seq !== loadSeq.current) return
      toast.show(failureText(error, '파일을 읽지 못했습니다.'), 'danger')
    } finally {
      // 이 읽기가 아직 유효할 때만 잠금을 푼다(뒤엣 읽기가 도는 중이면 그쪽이 푼다).
      if (seq === loadSeq.current) setLoadingFile(false)
    }
  }

  const submit = async () => {
    // 파일을 읽는 중에는 보내지 않는다 — 아직 표에 오르지 않은 줄이 있는 상태다.
    if (loadingFile) return
    const targets = submittable
    if (targets.length === 0) {
      toast.show('보낼 수 있는 줄이 없습니다. 붉게 표시된 칸을 먼저 고치세요.', 'warning')
      return
    }
    setBusy(true)
    try {
      // 서버는 한 번에 받는 줄 수에 상한이 있고, 넘치면 행 사유가 아니라 호출 전체를 거절한다.
      // 그래서 잘라 보낸다. 묶음 하나가 던지면 세 종류의 줄이 생긴다.
      //
      //  · 답을 받은 묶음 — 줄마다 생성·실패가 분명하다.
      //  · **던진 묶음** — 만들어졌는지 알 수 없다. 요청이 서버에 닿아 커밋된 뒤 응답만 잃는
      //    경우가 있어 "아무것도 안 만들어졌다"고 단정할 수 없다. 실패로 접으면 담당자가
      //    확인 없이 다시 보내게 된다.
      //  · 그 뒤 묶음 — 아예 보내지 않았다. 표에 그대로 남는다.
      const outcomes: GuestBatchOutcome[] = []
      const sentRowIds: string[] = []
      const unknownRowIds: string[] = []
      let callError: unknown = null
      for (const part of chunkGuestRows(targets)) {
        try {
          outcomes.push(...(await createGuestAccountsBatch(toGuestBatchPayload(part))))
          sentRowIds.push(...part.map((r) => r.rowId))
        } catch (error: unknown) {
          callError = error
          unknownRowIds.push(...part.map((r) => r.rowId))
          break
        }
      }

      const applied = applyBatchOutcomes(rows, sentRowIds, outcomes, unknownRowIds)
      setSummary(applied.summary)
      setNotes([])
      setRows(applied.remaining)
      setPreviewPage(0)

      // **답을 못 받은 줄이 있어도 목록을 다시 읽는다.** 그 줄이 이미 계정이 되었을 수 있고,
      // 담당자가 확인할 곳이 바로 그 목록이다.
      if (applied.summary.created > 0 || applied.summary.unknown > 0) {
        await qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
        await qc.invalidateQueries({ queryKey: ['admin', 'guest-ledger-accounts'] })
      }

      if (callError) {
        toast.show(
          `${applied.summary.created}건 생성. ${applied.summary.unknown}건은 결과를 확인하지 못했습니다 — ` +
            `${failureText(callError, '서버 응답을 받지 못했습니다.')} 계정 목록에서 먼저 확인한 뒤 다시 보내세요.`,
          'danger',
        )
        return
      }
      if (applied.remaining.length === 0) {
        toast.show(`GUEST 계정 ${applied.summary.created}건을 생성했습니다.`, 'success')
        close()
        return
      }
      toast.show(
        `${applied.summary.created}건 생성, ${applied.summary.failed}건 실패했습니다. 실패한 줄을 고쳐 다시 보내세요.`,
        applied.summary.created > 0 ? 'warning' : 'danger',
      )
    } finally {
      setBusy(false)
    }
  }

  const editor = (
    <div className="space-y-4">
          <Banner tone="info">
            이메일은 로그인 ID, 연락처는 최초 비밀번호입니다. 이미 있는 계정과 겹치는지는 서버가
            판정하므로, 겹친 줄은 생성되지 않고 사유가 붙어 남습니다.
          </Banner>

          {summary && (
            <Banner
              tone={
                summary.unknown > 0 ? 'danger' : summary.failed === 0 ? 'success' : 'warning'
              }
            >
              총 {summary.total}건 중 {summary.created}건 생성, {summary.failed}건 실패
              {summary.unknown > 0 && `, ${summary.unknown}건 결과 확인 필요`}했습니다.
              {summary.unknown > 0
                ? ' 결과를 확인하지 못한 줄은 만들어졌을 수도 있습니다 — 계정 목록에서 그 이메일을 찾아보고, 없을 때만 다시 보내세요.'
                : summary.failed > 0 &&
                  ' 아래 붉은 사유를 고쳐 다시 보내세요 — 이미 생성된 줄은 표에서 빠졌습니다.'}
            </Banner>
          )}

          {notes.length > 0 && (
            <Banner tone="info">
              {notes.map((note) => (
                <span key={note} className="block">
                  {note}
                </span>
              ))}
            </Banner>
          )}

          {presentation === 'bulk-page' && rows.length === 0 && (
            <label
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent) => {
                event.preventDefault()
                setDragging(false)
                const file = event.dataTransfer.files?.[0]
                if (file) void loadFile(file)
              }}
              className={cn(
                'flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-radius-lg border-2 border-dashed text-center transition-colors',
                dragging ? 'border-brand bg-brand/5' : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
                locked && 'pointer-events-none opacity-50',
              )}
            >
              <span className="text-body font-medium text-gray-700">
                CSV 또는 XLSX 파일을 여기로 드래그하거나 클릭해 선택하세요
              </span>
              <span className="text-caption text-gray-600">.csv (UTF-8) · .xlsx</span>
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void loadFile(file)
                }}
              />
            </label>
          )}

          {rows.length > 0 && <div className="space-y-2">
            <div className={`${ROW_GRID} items-center text-caption text-gray-600`}>
              <span className="text-center">No.</span>
              <span>이름</span>
              <span>이메일(로그인 ID)</span>
              <span>연락처(최초 비밀번호)</span>
              <span>NETWORKS 연결</span>
              <span aria-hidden="true" />
            </div>

            {visibleRows.map(({ row, index }) => {
              const rowIssues = issues.get(row.rowId) ?? []
              const fieldIssues = (field: GuestBatchField) =>
                rowIssues.filter((issue) => issue.field === field)
              const nameIssues = fieldIssues('name')
              const emailIssues = fieldIssues('email')
              const phoneIssues = fieldIssues('phone')
              const ledgerIssues = fieldIssues('ledger')
              const rowOnlyIssues = fieldIssues('row')
              return (
                <div key={row.rowId} className="space-y-1">
                  <div className={`${ROW_GRID} items-start`}>
                    <span className="pt-2 text-center text-caption text-gray-500">{index + 1}</span>
                    <div className="min-w-0 space-y-1">
                      <Input
                        aria-label={`${index + 1}번째 줄 이름`}
                        aria-describedby={nameIssues.length > 0 ? `${row.rowId}-name-issues` : undefined}
                        value={row.name}
                        invalid={nameIssues.length > 0}
                        disabled={locked}
                        onChange={(event) => updateRow(row.rowId, { name: event.target.value })}
                      />
                      <GuestFieldIssues id={`${row.rowId}-name-issues`} issues={nameIssues} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Input
                        type="email"
                        aria-label={`${index + 1}번째 줄 이메일`}
                        aria-describedby={emailIssues.length > 0 ? `${row.rowId}-email-issues` : undefined}
                        value={row.email}
                        invalid={emailIssues.length > 0}
                        disabled={locked}
                        onChange={(event) => updateRow(row.rowId, { email: event.target.value })}
                      />
                      <GuestFieldIssues id={`${row.rowId}-email-issues`} issues={emailIssues} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Input
                        aria-label={`${index + 1}번째 줄 연락처`}
                        aria-describedby={phoneIssues.length > 0 ? `${row.rowId}-phone-issues` : undefined}
                        value={row.phone}
                        invalid={phoneIssues.length > 0}
                        disabled={locked}
                        onChange={(event) => updateRow(row.rowId, { phone: event.target.value })}
                      />
                      <GuestFieldIssues id={`${row.rowId}-phone-issues`} issues={phoneIssues} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      {!canReadNetworks ? (
                        <span className="inline-block pt-2 text-caption text-gray-500">
                          NETWORKS 조회 권한 없음
                        </span>
                      ) : row.masterId && row.masterTable ? (
                        <span className="flex min-w-0 items-center gap-2 pt-2">
                          <span
                            className="truncate text-body-sm"
                            title={`NETWORKS · ${row.masterName ?? ''}`}
                          >
                            NETWORKS · {row.masterName ?? '연결됨'}
                          </span>
                          <TextAction
                            disabled={locked}
                            className={locked ? 'opacity-50' : undefined}
                            onClick={() =>
                              updateRow(row.rowId, {
                                masterTable: null,
                                masterId: null,
                                masterName: null,
                              })
                            }
                          >
                            해제
                          </TextAction>
                        </span>
                      ) : (
                        <Input
                          readOnly
                          value=""
                          placeholder="네트워크 원장에서 찾기 (선택)"
                          action={<Search className="size-4" />}
                          actionLabel={`${index + 1}번째 줄 네트워크 원장에서 찾기`}
                          onActionClick={() => setPickerRowId(row.rowId)}
                          onClick={() => setPickerRowId(row.rowId)}
                          disabled={locked}
                          invalid={ledgerIssues.length > 0}
                          aria-describedby={ledgerIssues.length > 0 ? `${row.rowId}-ledger-issues` : undefined}
                          className="cursor-pointer"
                        />
                      )}
                      <GuestFieldIssues id={`${row.rowId}-ledger-issues`} issues={ledgerIssues} />
                    </div>
                    <IconButton
                      icon={<Trash2 className="size-4" />}
                      label={`${index + 1}번째 줄 삭제`}
                      variant="ghost"
                      danger
                      disabled={locked}
                      onClick={() => removeRow(row.rowId)}
                    />
                  </div>
                  {rowOnlyIssues.length > 0 && (
                    <ul className="pl-8 text-caption text-danger">
                      {rowOnlyIssues.map((issue) => (
                        <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {previewPageCount > 1 && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-caption text-gray-600">
                  전체 {rows.length.toLocaleString('ko-KR')}줄 · 한 페이지 {PREVIEW_PAGE_SIZE}줄
                </span>
                <MiniPager
                  page={previewPage}
                  pageCount={previewPageCount}
                  onPage={setPreviewPage}
                />
              </div>
            )}

            {presentation === 'modal' && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRows((prev) => [...prev, createGuestDraftRow()])
                  setPreviewPage(Math.floor(rows.length / PREVIEW_PAGE_SIZE))
                }}
                disabled={locked}
              >
                <Plus className="size-4" />줄 추가
              </Button>
            )}
          </div>
          }
        </div>
  )

  const picker = canReadNetworks && pickerRowId !== null && (
    <LedgerCandidatePickerModal
      open
      initialKeyword={rows.find((row) => row.rowId === pickerRowId)?.name ?? ''}
      onPickMany={pickCandidates}
      onClose={() => setPickerRowId(null)}
    />
  )

  if (presentation === 'bulk-page') {
    return (
      <>
        <div className="space-y-5">
          <DetailTopBar
            back={<BackButton as={Link} to="/guest-accounts" state={location.state} />}
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={() => downloadCsv(TEMPLATE_NAME, buildGuestTemplateCsv())}
                >
                  템플릿 내려받기
                </Button>
                {rows.length > 0 && (
                  <Button variant="secondary" onClick={reset} disabled={locked}>
                    다시 선택
                  </Button>
                )}
                {failedRows.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => downloadCsv(FAILED_NAME, buildFailedRowsCsv(failedRows, issues))}
                    disabled={locked}
                  >
                    실패 줄 내려받기
                  </Button>
                )}
                <Button
                  onClick={() => void submit()}
                  disabled={locked || submittable.length === 0}
                >
                  {busy ? '업로드 중…' : loadingFile ? '파일 읽는 중…' : `${submittable.length}건 업로드`}
                </Button>
              </>
            }
          />
          <PageHeader
            title="GUEST 계정 대용량 업로드"
            help="파일의 각 줄마다 공통 GUEST 계정 하나를 만듭니다. 정상 줄은 생성하고, 중복·오류 줄만 사유와 함께 남깁니다."
          />
          {editor}
        </div>
        {picker}
      </>
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        dismissible={false}
        title="GUEST 계정 생성"
        help="줄마다 공통 GUEST 계정 하나를 만듭니다. NETWORKS 연결은 선택이며, 연결하면 그 인격도 함께 저장합니다. 되는 줄은 만들어지고 막힌 줄만 사유와 함께 남습니다."
        size="3xl"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={locked}>
              {summary ? '닫기' : '취소'}
            </Button>
            <Button onClick={() => void submit()} disabled={locked || submittable.length === 0}>
              {busy ? '생성 중…' : `${submittable.length}건 생성`}
            </Button>
          </>
        }
      >
        {editor}
      </Modal>

      {picker}
    </>
  )
}
