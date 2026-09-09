import { Button, DataTable, ListToolbar, Modal, Spinner, usePaged, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { participantContentKey } from '@/features/admin/sensitiveContents'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { RosterAddModal } from '@/features/program/RosterAddModal'
import { rosterColumns } from '@/features/program/rosterColumns'
import { useProgramRoster, useRemoveRosterEntries, type RosterRow } from '@/features/program/rosterHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 한 페이지에 세우는 행 수 — 페이징 훅과 표 페이저가 같은 값을 봐야 한다. */
const PAGE_SIZE = 10

/** 검색이 걸리는 축 — 표에 선 넷 그대로다. 보이는 값으로 찾을 수 없으면 검색이 아니다. */
function matches(row: RosterRow, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return [row.name, row.contactName, row.email, row.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(kw))
}

/**
 * 참가자 명단 — **자격 하나**의 목록. 자격이 어느 층에 서는지는 부모(`ProgramRosterCard`)가
 * 정하고, 이 화면을 부르는 이름은 워크스페이스(`config.rosterLabel`)가 갖는다.
 *
 * 할 수 있는 일은 추가와 삭제 둘뿐이다. 로그인·계정·기간은 여기 없다 — 그것은
 * `와이앤아처 GUEST 설정` 모달이 소유하는 다른 축이고, 두 축을 한 화면에 두었을 때
 * 담당자가 "담았더니 계정이 생겼다"로 읽던 것이 이 화면을 가른 이유다.
 *
 * **삭제 버튼은 고른 뒤에만 뜬다**(GUEST 명부 선택 줄과 같은 규칙) — 상시로 회색으로 서 있는
 * 버튼은 왜 못 누르는지를 스스로 답하지 못한다.
 */
export function RosterPanel({
  programId,
  persona,
}: {
  programId: string
  persona: MasterTable
}) {
  const config = useProgramWorkspace()
  const spec = PARTICIPANT_PERSONAS[persona]
  const toast = useToast()
  const masked = useMaskPolicy(participantContentKey(config.key))

  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data, isLoading, isError } = useProgramRoster(programId)
  const remove = useRemoveRosterEntries(programId)

  const rows = useMemo(() => data ?? [], [data])
  /** 이 탭의 자격만 남긴다 — 자격은 탭이 답하므로 표에 구분 열을 두지 않는다. */
  const personaRows = useMemo(() => rows.filter((r) => r.master_table === persona), [rows, persona])
  const filtered = useMemo(() => personaRows.filter((r) => matches(r, keyword)), [personaRows, keyword])

  const { pageItems, page, setPage } = usePaged(filtered, PAGE_SIZE)
  const columns = useMemo(() => rosterColumns(masked, persona), [masked, persona])

  const runRemove = () => {
    remove.mutate(selected, {
      onSuccess: (n) => {
        setSelected([])
        setConfirmOpen(false)
        toast.show(`${n}건을 ${config.rosterLabel}에서 뺐습니다.`, 'success')
      },
      onError: (e: unknown) => {
        setConfirmOpen(false)
        toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다.', 'danger')
      },
    })
  }

  if (isLoading) return <Spinner />

  return (
    <>
      <div className="space-y-3">
        <ListToolbar
          keyword={keyword}
          onKeywordChange={setKeyword}
          searchPlaceholder={spec.listSearchPlaceholder}
          actions={<Button onClick={() => setAddOpen(true)}>{spec.label} 추가</Button>}
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
            <span className="text-body font-semibold text-gray-900">{selected.length}건 선택</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline-danger"
                onClick={() => setConfirmOpen(true)}
                disabled={remove.isPending}
              >
                목록에서 삭제
              </Button>
              <Button variant="ghost" onClick={() => setSelected([])} disabled={remove.isPending}>
                선택 해제
              </Button>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={pageItems}
          rowKey={(r) => r.id}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          // 표에 서는 것은 사용자가 지정한 넷뿐이다. 표준 컬럼(작성자·수정일·관리)을 켜면
          // 이 원장에 없는 축이 빈 칸으로 딸려 와 가로 스크롤만 만든다.
          standardColumns={false}
          // 조회 실패와 빈 명단은 다른 사실이다 — 한 문장으로 뭉뚱그리면 원인을 짚을 수 없다.
          emptyText={
            isError
              ? `${config.rosterLabel}을(를) 불러오지 못했습니다.`
              : `담긴 ${spec.label}이(가) 없습니다.`
          }
          // 좌측 건수는 '필터 반영 / 전체'로 읽힌다 — 검색으로 좁힌 뒤에도 총량을 잃지 않는다.
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: filtered.length,
            totalAll: personaRows.length,
            onChange: setPage,
          }}
        />
      </div>

      <RosterAddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        programId={programId}
        master={persona}
      />

      {/*
        되돌릴 수 있는 작업이라 따라쓰기까지 요구하지 않는다(뺀 줄은 다시 담을 수 있다).
        그래도 확인은 받는다 — 전체 선택 뒤 한 번의 오클릭이 명단을 통째로 비우는 자리다.
      */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`${config.rosterLabel}에서 삭제`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={remove.isPending}>
              취소
            </Button>
            <Button variant="danger" onClick={runRemove} disabled={remove.isPending}>
              {remove.isPending ? '삭제 중…' : '삭제'}
            </Button>
          </div>
        }
      >
        <p className="text-body text-gray-700">
          <b>{selected.length}건</b>을 {config.rosterLabel}에서 뺍니다. 원장(
          {spec.label})의 데이터는 지워지지 않으며, 같은 대상을 다시 담을 수 있습니다.
        </p>
      </Modal>
    </>
  )
}
