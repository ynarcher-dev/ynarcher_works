import {
  Badge,
  DataTable,
  EmptyValue,
  PeriodCell,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import { useMemo } from 'react'
import {
  FUND_CHARACTER_LABEL,
  FUND_SOURCE_LABEL,
  FUND_STATUS_TONE,
  FUND_STRATEGY_LABEL,
  FUND_TYPE_LABEL,
  MILLION_UNIT_NOTE,
  amountInMillions,
  fundManagerLabel,
  fundStatusLabel,
  type FundListRow,
} from '@/features/fund/fundListHooks'

interface FundListTableProps {
  rows: FundListRow[]
  onRowClick?: (row: FundListRow) => void
  emptyText?: string
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  pagination?: DataTableProps<FundListRow>['pagination']
}

/** 빈 칸 표기(규격은 공용 `EmptyValue`가 소유). */
const dash = <EmptyValue />

/**
 * 펀드(조합) 목록 데이터 테이블. STARTUP 풀 테이블 골격 재사용.
 * 컬럼: 펀드명·코드·재원·성격·구분·펀드유형·상태·존속기간·약정총액·실출자금액·집행액·잔액·관리인력.
 * 생성자(created_by) 컬럼은 두지 않는다 — 관리 주체는 배정 인력이며 생성자는 상세 페이지에만 남긴다.
 */
export function FundListTable({
  rows,
  onRowClick,
  emptyText,
  selectedKeys,
  onSelectionChange,
  pagination,
}: FundListTableProps) {
  // 관리인력은 내부 임직원이라 민감정보 마스킹 대상이 아니다.
  const columns = useMemo<Column<FundListRow>[]>(
    () => [
      // 폭·정렬·수치서식은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
      { key: 'name', header: '펀드명', primary: true, type: 'name', render: (f) => f.name },
      {
        // 펀드코드(6자리 영숫자 난수). 사업코드와 같은 형식·같은 발급 경로(전역 레지스트리)라
        // 워크스페이스가 달라도 값이 겹치지 않는다. 목록에서는 본문 텍스트로 노출한다.
        key: 'code',
        header: '코드',
        // 펀드코드는 자릿수가 정해진 식별자라 고정폭이다. 이 다섯 열(코드·재원·성격·구분·펀드유형)이
        // 가변폭이던 동안 값은 모두 5자 이하인데 남는 폭의 절반을 가져갔다(2026-09-01 정정).
        type: 'code',
        render: (f) => f.code ?? dash,
      },
      // 재원·성격·구분·펀드유형은 펀드를 서술하는 고정 속성이라 본문 텍스트로 적는다.
      // 배지는 상태 하나만 쓴다 — 색이 여러 열에 흩어지면 정작 봐야 할 운용 상태가 묻힌다.
      {
        key: 'source_type',
        header: '재원',
        type: 'code',
        render: (f) => (f.source_type ? (FUND_SOURCE_LABEL[f.source_type] ?? f.source_type) : dash),
      },
      {
        key: 'character_type',
        header: '성격',
        type: 'code',
        render: (f) =>
          f.character_type ? (FUND_CHARACTER_LABEL[f.character_type] ?? f.character_type) : dash,
      },
      {
        key: 'strategy_type',
        header: '구분',
        type: 'code',
        render: (f) =>
          f.strategy_type ? (FUND_STRATEGY_LABEL[f.strategy_type] ?? f.strategy_type) : dash,
      },
      {
        key: 'fund_type',
        header: '펀드유형',
        type: 'code',
        render: (f) => (f.fund_type ? (FUND_TYPE_LABEL[f.fund_type] ?? f.fund_type) : dash),
      },
      {
        key: 'status',
        header: '상태',
        type: 'badge',
        render: (f) => <Badge tone={FUND_STATUS_TONE[f.status] ?? 'neutral'}>{fundStatusLabel(f.status)}</Badge>,
      },
      {
        // 기간 열 공용 규격(type: 'period' + PeriodCell) — 시작/종료를 한 줄에 적고, 날짜 중간에서
        // 접히지 않도록 폭은 종류가 23자에 맞춰 잡는다(2026-09-02 두 줄 표기에서 전환).
        key: 'term',
        header: '존속기간',
        type: 'period',
        render: (f) => <PeriodCell start={f.term_start} end={f.term_end} />,
      },
      {
        key: 'total_commitment',
        header: '약정총액',
        type: 'money',
        render: (f) => amountInMillions(f.total_commitment),
      },
      {
        key: 'paid_in_amount',
        header: '실출자금액',
        type: 'money',
        render: (f) => (f.paid_in_amount == null ? dash : amountInMillions(f.paid_in_amount)),
      },
      {
        key: 'drawn_amount',
        header: '집행액',
        type: 'money',
        render: (f) => amountInMillions(f.drawn_amount),
      },
      {
        key: 'balance',
        header: '잔액',
        type: 'money',
        render: (f) => amountInMillions(f.total_commitment - f.drawn_amount),
      },
      {
        // 인력 세 축(대표펀드매니저·운용인력·관리인력) 중 목록에는 관리인력만 세운다
        // (2026-09-02 사용자 지정). 목록에서 인력 열이 답할 물음은 "이 펀드를 지금 누구에게
        // 물어야 하는가" 하나이고, 그 창구는 조합 행정·보고·사후관리를 맡는 관리인력이다.
        // 대표펀드매니저·운용인력은 상세에서 읽어도 되는 값인데 목록에서 사람 이름 열 셋을
        // 나란히 세우느라(`외 N`까지 붙어) 금액 네 열이 그만큼 좁아져 있었다.
        // 대표펀드매니저는 열이 없어도 검색어가 답한다(툴바 placeholder 참조).
        key: 'admins',
        header: '관리인력',
        type: 'person',
        render: (f) => fundManagerLabel(f.operators) ?? dash,
      },
    ],
    [],
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(f) => f.id}
      onRowClick={onRowClick}
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      pagination={pagination}
      // 금액 4열의 단위. 값마다 '백만원'을 붙이면 행 수 × 4번 반복되어 열 폭을 먹으므로
      // 표 전체에 한 번만 적는다(자리는 표 테두리 안, 머리글 줄 위).
      caption={MILLION_UNIT_NOTE}
      // 금액만 네 열이라 가로가 빠듯하다. 열 폭은 내용에 맞추되(자동 레이아웃) 셀 여백만 좁힌다 —
      // 존속기간·금액처럼 끝이 잘리면 뜻이 달라지는 값이 있어 말줄임(fixed)을 쓰지 않는다.
      dense
      showManageColumn={false}
      // 생성자(created_by)를 '관리자'로 재라벨해 노출하던 우측 표준 컬럼을 내린다 — 관리 주체는
      // 생성자가 아니라 배정된 인력이고, 그 답은 관리인력 컬럼이 이미 하고 있다.
      showAuthor={false}
      emptyText={emptyText ?? '등록된 펀드가 없습니다.'}
    />
  )
}
