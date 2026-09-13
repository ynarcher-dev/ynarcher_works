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
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { CATEGORY_FILTER_OPTIONS } from '@/features/networks/config'
import {
  EMPTY_NETWORK_FILTERS,
  searchPlaceholderFor,
} from '@/features/networks/filters'
import { useNetworkListPage, type NetworkRow } from '@/features/networks/hooks'

/** 모달 안 표는 한 화면에 읽히는 높이로 끊고 공용 DataTable 페이저를 그대로 쓴다. */
const PAGE_SIZE = 10
const ALL_TAB = 'all'

/** NETWORKS 원장의 구분 태그와 목록 필터가 같은 값을 쓴다. 미지정도 분류 축의 마지막 탭이다. */
const NETWORK_TABS = [
  { key: ALL_TAB, label: '전체' },
  ...CATEGORY_FILTER_OPTIONS.map((item) => ({ key: item.value, label: item.label })),
]

export interface LedgerCandidate {
  masterTable: 'networks'
  id: string
  name: string
  loginName: string | null
  email: string | null
  phone: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toCandidate(row: NetworkRow): LedgerCandidate {
  return {
    masterTable: 'networks',
    id: row.id,
    name: row.name,
    loginName: row.name,
    email: text(row.email),
    phone: text(row.phone),
  }
}

/**
 * GUEST 계정에 연결할 NETWORKS 행 하나를 고르는 창.
 *
 * 별도 후보 목록을 만들지 않고 NETWORKS 메인 목록의 서버 검색·구분 필터·페이지네이션 훅과
 * 공용 `Tabs`·`ListToolbar`·`DataTable`을 그대로 쓴다. 이 셋을 따로 흉내 내면 메인 원장의
 * 필터 기준이나 페이지 번호 규칙이 바뀌는 날 선택창만 옛 규칙으로 남는다.
 *
 * 원장 연결은 계속 선택 사항이다. 이 창은 연결하기로 한 경우에만 NETWORKS에서 찾는 도구이며,
 * 닫아도 계정은 이름·이메일·연락처만으로 생성할 수 있다.
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

  // NETWORKS 메인 목록과 검색 범위를 맞춘다. 가린 연락처를 검색으로 되짚지 않는다.
  const masked = useMaskPolicy('networks.all')
  const searchScope = useMemo(
    () => ({ email: !masked.email, phone: !masked.phone }),
    [masked.email, masked.phone],
  )
  const filters = useMemo(
    () => ({
      ...EMPTY_NETWORK_FILTERS,
      categories: tab === ALL_TAB ? [] : [tab],
    }),
    [tab],
  )
  const networks = useNetworkListPage(
    'all',
    keyword,
    page,
    PAGE_SIZE,
    filters,
    searchScope,
  )

  useEffect(() => {
    if (!open) return
    setTab(ALL_TAB)
    setKeyword(initialKeyword)
    setPage(0)
    setSelected(new Map())
  }, [initialKeyword, open])

  const rows = networks.data?.rows ?? []

  /**
   * DataTable의 전체선택은 현재 페이지를 대상으로 한다. 다른 페이지에서 고른 id는 여기서
   * 보존하고, 지금 페이지에서 바뀐 체크만 갈아 끼운다.
   */
  const changePageSelection = (keys: string[]) => {
    const on = new Set(keys)
    setSelected((current) => {
      const next = new Map(current)
      for (const row of rows) {
        if (on.has(row.id)) next.set(row.id, toCandidate(row))
        else next.delete(row.id)
      }
      return next
    })
  }

  const toggleRow = (row: NetworkRow) => {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, toCandidate(row))
      return next
    })
  }

  const columns = useMemo<Column<NetworkRow>[]>(
    () => [
      { key: 'name', header: '이름', type: 'name', render: (row) => row.name },
      {
        key: 'affiliation',
        header: '소속',
        type: 'long',
        render: (row) => text(row.affiliation) ?? <EmptyValue />,
      },
      {
        key: 'position',
        header: '직책/직급',
        type: 'text',
        render: (row) => text(row.profile?.position) ?? <EmptyValue />,
      },
      {
        key: 'email',
        header: '이메일',
        type: 'long',
        render: (row) => text(row.email) ?? <EmptyValue />,
      },
      {
        key: 'phone',
        header: '연락처',
        type: 'phone',
        render: (row) => text(row.phone) ?? <EmptyValue />,
      },
      {
        key: 'category',
        header: '구분',
        type: 'code',
        render: (row) => text(row.category_label) ?? '미지정',
      },
    ],
    [],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="네트워크 원장에서 찾기"
      help="NETWORKS 구분 탭에서 대상을 찾아 여러 건을 체크할 수 있습니다. 선택한 행마다 GUEST 계정 입력 줄을 만들고 NETWORKS 연결을 함께 저장합니다. 연결하지 않아도 GUEST 계정은 만들 수 있습니다."
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
            선택한 {selected.size}건 넣기
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
          searchPlaceholder={searchPlaceholderFor(searchScope)}
          dense
        />

        {networks.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : networks.error ? (
          <Banner tone="danger">NETWORKS 목록을 불러오지 못했습니다.</Banner>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            standardColumns={false}
            selectable
            selectedKeys={[...selected.keys()]}
            onSelectionChange={changePageSelection}
            onRowClick={toggleRow}
            caption={selected.size > 0 ? `${selected.size}건 선택` : undefined}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: networks.data?.total ?? 0,
              totalAll: networks.data?.totalAll,
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
