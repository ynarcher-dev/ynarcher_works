import {
  Banner,
  Button,
  DataTable,
  EmptyValue,
  ListToolbar,
  Modal,
  Spinner,
  Tabs,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  useGuestLedgerCandidates,
  type GuestLedgerCandidate,
} from '@/features/guest/guestLedgerCandidateService'
import { CATEGORY_FILTER_OPTIONS } from '@/features/networks/config'

/** 모달 안 표는 한 화면에 읽히는 높이로 끊고 공용 DataTable 페이저를 그대로 쓴다. */
const PAGE_SIZE = 10
const ALL_TAB = 'all'

/** NETWORKS 원장의 구분 태그와 목록 필터가 같은 값을 쓴다. 미지정도 분류 축의 마지막 탭이다. */
const NETWORK_TABS = [
  { key: ALL_TAB, label: '전체' },
  ...CATEGORY_FILTER_OPTIONS.map((item) => ({ key: item.value, label: item.label })),
]

export type LedgerCandidate = GuestLedgerCandidate

/**
 * GUEST 계정 입력에 복사할 NETWORKS 행을 고르는 창.
 *
 * 전용 RPC가 이름·이메일·소속만 서버 검색·구분 필터·페이지네이션하고, 화면은 공용
 * `Tabs`·`ListToolbar`·`DataTable`을 그대로 쓴다.
 *
 * **읽기 전용이다.** 여기서 원장 행을 만들거나 고치지 않는다 — 가져오는 것은 이름·이메일·소속
 * 문자열뿐이고, 원장을 바꿔야 하면 NETWORKS 화면에서 따로 고친다. 전화번호 같은 다른 원장
 * 열은 전용 RPC의 반환 계약부터 제외한다.
 *
 * 선택한 원장 id는 계정 요청에 보내지 않으며, 생성 뒤에도 원장 변경을 따라 동기화하지 않는다.
 */
export function LedgerCandidatePickerModal({
  open,
  initialKeyword,
  onPickMany,
  onClose,
}: {
  open: boolean
  initialKeyword: string
  onPickMany: (candidates: LedgerCandidate[]) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState(ALL_TAB)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [page, setPage] = useState(0)
  /** 탭·검색·페이지를 옮겨도 체크를 보존하려고 id뿐 아니라 그때 읽은 행 사본을 함께 든다. */
  const [selected, setSelected] = useState<Map<string, LedgerCandidate>>(() => new Map())

  const candidates = useGuestLedgerCandidates(
    {
      search: keyword,
      page,
      pageSize: PAGE_SIZE,
      category: tab === ALL_TAB ? null : tab,
    },
    open,
  )

  useEffect(() => {
    if (!open) return
    setTab(ALL_TAB)
    setKeyword(initialKeyword)
    setPage(0)
    setSelected(new Map())
  }, [initialKeyword, open])

  const rows = candidates.data?.rows ?? []

  /**
   * DataTable의 전체선택은 현재 페이지를 대상으로 한다. 다른 페이지에서 고른 id는 여기서
   * 보존하고, 지금 페이지에서 바뀐 체크만 갈아 끼운다.
   */
  const changePageSelection = (keys: string[]) => {
    const on = new Set(keys)
    setSelected((current) => {
      const next = new Map(current)
      for (const row of rows) {
        if (on.has(row.sourceId)) next.set(row.sourceId, row)
        else next.delete(row.sourceId)
      }
      return next
    })
  }

  const toggleRow = (row: LedgerCandidate) => {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.sourceId)) next.delete(row.sourceId)
      else next.set(row.sourceId, row)
      return next
    })
  }

  const columns = useMemo<Column<LedgerCandidate>[]>(
    () => [
      { key: 'name', header: '이름', type: 'name', render: (row) => row.name },
      {
        key: 'affiliation',
        header: '소속',
        type: 'long',
        render: (row) => row.affiliation ?? <EmptyValue />,
      },
      {
        key: 'email',
        header: '이메일',
        type: 'long',
        render: (row) => row.email ?? <EmptyValue />,
      },
    ],
    [],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="데이터베이스(NETWORKS)에서 불러오기"
      help="선택한 행의 이름·이메일·소속만 계정 입력 줄에 복사합니다. 원장 id는 저장하지 않고 이후 원장 변경과도 동기화하지 않습니다. 비어 있는 필수 값은 입력 줄에서 직접 채우세요."
      size="3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={selected.size === 0}
            onClick={() => {
              onPickMany([...selected.values()])
              onClose()
            }}
          >
            선택한 {selected.size}건 불러오기
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Tabs
          items={NETWORK_TABS}
          value={tab}
          onChange={(key) => {
            setTab(key)
            setPage(0)
          }}
        />

        <ListToolbar
          keyword={keyword}
          onKeywordChange={(value) => {
            setKeyword(value)
            setPage(0)
          }}
          searchPlaceholder="이름·소속·이메일 검색"
          dense
        />

        {candidates.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : candidates.error ? (
          <Banner tone="danger">NETWORKS 목록을 불러오지 못했습니다.</Banner>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.sourceId}
            standardColumns={false}
            selectable
            selectedKeys={[...selected.keys()]}
            onSelectionChange={changePageSelection}
            onRowClick={toggleRow}
            caption={selected.size > 0 ? `${selected.size}건 선택` : undefined}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: candidates.data?.total ?? 0,
              onChange: setPage,
            }}
            emptyText={
              keyword.trim()
                ? '검색과 일치하는 NETWORKS 정보가 없습니다.'
                : '이 구분에 등록된 NETWORKS 정보가 없습니다.'
            }
          />
        )}
      </div>
    </Modal>
  )
}
