import {
  Badge,
  DataTable,
  EmptyValue,
  FilterResetButton,
  Input,
  MultiSelectFilter,
  PageHeader,
  Spinner,
  Tooltip,
  tooltipScale,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import {
  bankLabel,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPE_ORDER,
} from '@/features/management/partners/config'
import {
  formatDirectoryRegistrationNo,
  formatMaskedAccountNo,
} from '@/features/office/partners/partnerDirectory'
import {
  EMPTY_DIRECTORY_FILTERS,
  hasActiveDirectoryFilters,
  usePartnerDirectoryPage,
  type DirectoryFilters,
  type PartnerDirectoryEntry,
} from '@/features/office/partners/officePartnersApi'

/** 회의록·지사 정보와 같은 한 페이지 분량(OFFICE 조회 목록 공통). */
const PAGE_SIZE = 15

const ACTIVE_OPTIONS = [
  { value: 'true', label: '사용' },
  { value: 'false', label: '중단' },
]

/**
 * OFFICE 거래처 정보(조회 전용).
 *
 * 원장은 MANAGEMENT '거래처 정보'가 소유하고 여기서는 확인만 한다. 확인만 하는 화면이므로
 * 행을 눌러 여는 상세도 두지 않는다 — 표에 적힌 것이 이 화면이 아는 전부다.
 *
 * 계좌번호는 뒤 네 자리, 개인 거래처의 생년월일은 연도까지만 보인다. 자르는 일은 화면이 아니라
 * 서버(뷰)가 하며, 증빙 서류는 컬럼 자체가 오지 않는다 — 목록에 없는 값은 새지 않는다.
 * 원본이 필요하면 경영지원이 MANAGEMENT에서 연다.
 */
export function OfficePartnersPanel() {
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_DIRECTORY_FILTERS)
  const [page, setPage] = useState(0)

  const { data, isLoading } = usePartnerDirectoryPage(keyword, filters, page, PAGE_SIZE)
  const rows = data?.rows ?? []

  // 검색·필터가 바뀌면 첫 페이지로 되돌린다(있지도 않은 3페이지에 머무르지 않게).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
  }, [keyword, filtersKey])

  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<PartnerDirectoryEntry>[] = [
    {
      key: 'code',
      header: '코드',
      type: 'code',
      render: (p) => <span className="tabular-nums text-gray-600">{p.code}</span>,
    },
    { key: 'name', header: '거래처명', primary: true, type: 'name', render: (p) => p.name },
    {
      key: 'partnerType',
      header: '구분',
      type: 'code',
      render: (p) => PARTNER_TYPE_LABELS[p.partnerType],
    },
    {
      key: 'registrationNo',
      header: '사업자등록번호(생년월일)',
      type: 'text',
      render: (p) => {
        const v = formatDirectoryRegistrationNo(p.partnerType, p.registrationNo)
        return v ? <span className="tabular-nums text-gray-600">{v}</span> : <EmptyValue />
      },
    },
    {
      key: 'bank',
      header: '은행명',
      type: 'text',
      render: (p) => bankLabel(p.bankCode) ?? <EmptyValue />,
    },
    {
      key: 'accountNo',
      header: '계좌번호',
      type: 'text',
      render: (p) => {
        const v = formatMaskedAccountNo(p.accountNoLast4)
        return v ? <span className="tabular-nums text-gray-600">{v}</span> : <EmptyValue />
      },
    },
    {
      key: 'accountHolder',
      header: '예금주',
      type: 'person',
      render: (p) => p.accountHolder ?? <EmptyValue />,
    },
    // 거래를 그만둔 상대도 목록에 남는다 — 과거 지급 내역을 설명해야 하기 때문이다.
    {
      key: 'isActive',
      header: '사용 여부',
      type: 'badge',
      render: (p) =>
        p.isActive ? <Badge tone="success">사용</Badge> : <Badge tone="neutral">중단</Badge>,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="거래처 정보"
        search={
          <Input
            placeholder="거래처명·코드·사업자등록번호·예금주 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="구분"
          options={PARTNER_TYPE_ORDER.map((v) => ({ value: v, label: PARTNER_TYPE_LABELS[v] }))}
          selected={filters.types}
          onChange={(types) => setFilters({ ...filters, types })}
        />
        <MultiSelectFilter
          label="사용 여부"
          options={ACTIVE_OPTIONS}
          selected={filters.active}
          onChange={(active) => setFilters({ ...filters, active })}
        />
        {hasActiveDirectoryFilters(filters) && (
          <FilterResetButton onClick={() => setFilters(EMPTY_DIRECTORY_FILTERS)} />
        )}
        {/*
          왜 일부만 보이는지는 물어봐야 답하는 규칙이 아니라 화면이 먼저 말해야 하는 사실이다.
          다만 줄을 하나 더 쓰면 표보다 안내가 먼저 읽히므로 필터 줄 끝의 말풍선에 둔다.
        */}
        <span className="ml-auto text-caption text-gray-500">
          일부 값은 가려집니다
          <Tooltip
            label="가려지는 값"
            content={
              '계좌번호는 뒤 4자리, 개인 거래처의 생년월일은 연도만 보입니다.\n' +
              '증빙 서류와 계좌 원본은 MANAGEMENT 거래처 정보에서 확인합니다.\n' +
              '등록·수정도 그곳에서 합니다.'
            }
            className={tooltipScale.gap}
          />
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        // 조회 전용이라 선택·관리 열을 두지 않는다. 생성자도 두지 않는다(관리 축이 아니다).
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          selectable={false}
          showAuthor={false}
          showManageColumn={false}
          emptyText={
            keyword.trim() || hasActiveDirectoryFilters(filters)
              ? '조건에 맞는 거래처가 없습니다.'
              : '등록된 거래처가 없습니다.'
          }
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalAll: data?.totalAll ?? 0,
            onChange: setPage,
          }}
        />
      )}
    </div>
  )
}
