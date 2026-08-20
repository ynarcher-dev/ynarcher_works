import { DataTable, type Column, type DataTableProps } from '@ynarcher/ui'
import { useMemo } from 'react'
import { maskName } from '@/lib/mask'
import { memberSummary } from '@/lib/memberLabel'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { formatFounded, readIndustries } from '@/features/startup/startupGrowth'
import { isInvested, managementStatusLabel } from '@/features/startup/startupClassification'

/**
 * 스타트업 풀(발굴·보육·투자) 목록 행. `startups` 테이블 스키마의 표시 컬럼 부분집합이다.
 * 목록에 필요 없는 상세 필드(address·contact·sns_links 등)는 인덱스 시그니처로 흡수한다.
 */
export interface StartupPoolRow {
  id: string
  name: string
  /** 대표자명(startups.representative). */
  representative?: string | null
  /** 사업자등록번호(startups.biz_reg_no). */
  biz_reg_no?: string | null
  /** 설립일(startups.founded_on) — 목록도 상세와 같이 설립일+경과(formatFounded)로 표시. */
  founded_on?: string | null
  /** 분야(startups.industry). SSOT는 industries(배열)이며, 목록은 readIndustries로 읽는다. */
  industry?: string | null
  /** 소재지(startups.location) — location_tags 태그명(시·도 등). 상세주소는 목록에 노출하지 않는다. */
  location?: string | null
  /** 성장 단계(startups.stage). */
  stage?: string | null
  /** 구분 코드: sourced/incubated/invested/other(startups.management_status). */
  management_status?: string | null
  /** 현황: 풀 진행 상태(startups.pool_status). 투자기업에서만 채워진다(그 외는 '-'). */
  pool_status?: string | null
  updated_at?: string | null
  created_by?: string | null
  /** 생성자(생성자, created_by → users) FK 임베드. 전 구분 공통 생성자 컬럼의 원천. */
  creator?: { id: string; name: string | null } | null
  /** 지정 담당자(startup_managers) 임베드. 투자기업 담당자 컬럼의 원천(비투자는 없음). */
  managers?: { user_id: string; is_lead: boolean; user: { id: string; name: string | null } | null }[]
  deleted_at?: string | null
  [key: string]: unknown
}

interface StartupPoolTableProps {
  rows: StartupPoolRow[]
  isLoading?: boolean
  /**
   * 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리'). 이름 정책이 켜지면 외부 기업의 대표자명을 가린다
   * (담당자·생성자는 내부 임직원이라 대상 아님). 카탈로그: features/admin/sensitiveContents.ts
   */
  contentKey: string
  /** 행 클릭(상세 진입). 지정 시 행이 클릭 가능해진다. */
  onRowClick?: (row: StartupPoolRow) => void
  /** 행 다중선택 키(controlled). 일괄 작업용으로 상위가 소유한다. */
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** 서버 사이드 페이지네이션(0-base). DataTable로 그대로 전달된다. */
  pagination?: DataTableProps<StartupPoolRow>['pagination']
}

/**
 * 스타트업 풀 관리 공용 데이터 테이블.
 * 컬럼: 체크박스·No.·기업명·대표자명·사업자등록번호·설립일·소재지·분야(텍스트, 최대 3개)·단계·구분·관리현황·담당자·수정일.
 * 좌측 선택/넘버링과 우측 표준 컬럼(수정일)은 공용 DataTable이 소유하고,
 * 본 컴포넌트는 그 사이의 도메인 컬럼(기업명~담당자)만 정의한다.
 * 열 구성은 탭(구분)과 무관하게 **투자기업 기준으로 하나로 통일**한다 — 탭마다 열이 달라지면
 * 같은 원장을 보는데도 표가 다른 표처럼 읽히고, 탭을 옮길 때마다 눈이 열 위치를 다시 찾아야 한다.
 * 그래서 관리현황(투자 전용 값)은 비투자 탭에서 '-'로 비고, 발굴 경로(자유 서술)는 상세 페이지에만 둔다.
 * 비활성화(삭제)는 목록이 아니라 상세 페이지에서 수행하므로 관리 컬럼(showManageColumn=false)은 두지 않는다.
 * 담당자 컬럼은 투자=지정 담당자·그 외=공동관리를 뜻한다(생성자 축은 목록에서 제외).
 */
/**
 * 투자기업 담당자 표시명: 대표(리드) 1명 + "외 N"(공용 규격 memberSummary).
 * 지정 담당자가 없으면 null(→ "미지정"). 생성자로 폴백하지 않는다.
 */
function managerLabel(r: StartupPoolRow): string | null {
  const ms = r.managers ?? []
  const lead = ms.find((m) => m.is_lead)
  // 리드를 맨 앞에 세우고 나머지를 뒤로 — 대표가 누구인지는 도메인이, 표기는 공용 규격이 정한다.
  const ordered = lead ? [lead, ...ms.filter((m) => m !== lead)] : ms
  return memberSummary(ordered.map((m) => m.user?.name))
}

export function StartupPoolTable({
  rows,
  contentKey,
  onRowClick,
  selectedKeys,
  onSelectionChange,
  pagination,
}: StartupPoolTableProps) {
  const masked = useMaskPolicy(contentKey)
  // 마스킹 대상은 외부 기업의 대표자명뿐이다 — 담당자·생성자는 내부 임직원이라 원본을 유지한다.
  const externalName = (v: string | null | undefined): string | null =>
    v ? (masked.name ? maskName(v) : v) : null
  const columns = useMemo<Column<StartupPoolRow>[]>(() => {
    const cols: Column<StartupPoolRow>[] = [
      {
        key: 'name',
        header: '기업명',
        type: 'name',
        render: (r) => r.name ?? '-',
      },
      {
        key: 'representative',
        header: '대표자명',
        type: 'person',
        render: (r) => externalName(r.representative) || '-',
      },
      {
        // 사업자등록번호는 폭이 일정한 코드지만 전용 종류가 없어 짧은 라벨(text)로 둔다.
        key: 'biz_reg_no',
        header: '사업자등록번호',
        type: 'text',
        render: (r) => r.biz_reg_no || <span className="text-gray-400">-</span>,
      },
      {
        // 상세페이지와 동일하게 설립일 + 만 나이(formatFounded)로 표기한다.
        // 종류는 date — 경과 표기만큼 계산 폭보다 길어지지만, 자동 레이아웃이 열을 늘려 다 보여준다.
        key: 'founded_on',
        header: '설립일',
        type: 'date',
        render: (r) => (r.founded_on ? formatFounded(r.founded_on) : <span className="text-gray-400">-</span>),
      },
      {
        // 소재지는 시·도 태그명 한 덩어리(짧고 값이 항상 하나)라 폭이 널뛰는 분야 열 앞에 둔다.
        key: 'location',
        header: '소재지',
        type: 'text',
        render: (r) => r.location || <span className="text-gray-400">-</span>,
      },
      {
        // 분야는 값이 최대 3개 이어지는 가변 폭 열이라 badge(한 개 고정폭)가 아니라 long이다.
        // 배지가 아니라 한 줄 텍스트다(2026-08-20) — 배지는 그 자체가 강세라 값이 여러 개인
        // 열에서는 색 덩어리가 줄마다 다른 길이로 서고, 개수에 따라 줄 높이가 흔들린다.
        // 색은 상태에만 쓰고 분류는 텍스트로 둔다는 규칙과도 같은 방향이다.
        key: 'industry',
        header: '분야',
        type: 'long',
        render: (r) => {
          const inds = readIndustries(r).slice(0, 3)
          if (inds.length === 0) return <span className="text-gray-400">-</span>
          const text = inds.join(', ')
          return (
            <span className="block truncate" title={text}>
              {text}
            </span>
          )
        },
      },
      {
        key: 'stage',
        header: '단계',
        type: 'text',
        render: (r) => r.stage || <span className="text-gray-400">-</span>,
      },
      {
        key: 'management_status',
        header: '구분',
        type: 'text',
        render: (r) =>
          managementStatusLabel(r.management_status) || <span className="text-gray-400">-</span>,
      },
      {
        // 관리현황(pool_status)은 투자기업에서만 채워지는 값이지만 열은 모든 탭에 둔다 —
        // 비투자 탭에서는 '-'로 비며, 그 빈칸이 "아직 투자 전"이라는 정보 자체다.
        key: 'pool_status',
        header: '관리현황',
        type: 'text',
        render: (r) => r.pool_status || <span className="text-gray-400">-</span>,
      },
      {
        // 담당자(관리 주체): 투자기업은 지정 담당자(리드, 외 N), 그 외는 공동관리(쓰기 권한자 누구나).
        // 지정 담당자가 없어도 생성자로 폴백하지 않는다 — 두 축은 별개이고 생성자는 권한이 없다.
        key: 'managers',
        header: '담당자',
        type: 'person',
        render: (r) => {
          if (isInvested(r.management_status)) {
            // 담당자는 내부 임직원이라 마스킹하지 않는다.
            const label = managerLabel(r)
            return label ?? <span className="text-gray-400">미지정</span>
          }
          return '공동관리'
        },
      },
    ]

    return cols
    // externalName은 masked.name에만 의존하므로 정책이 바뀔 때만 컬럼을 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masked.name])

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      // 폭·정렬은 열마다의 type이 정하고(수동 w-* 없음), 레이아웃은 기본(auto)이라
      // 계산 폭보다 긴 값(설립일 경과 등)은 열이 늘어나 다 보인다.
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      pagination={pagination}
      showManageColumn={false}
      // 생성자(created_by)는 아무 권한도 갖지 않는 축이라 목록에서 내린다 — 목록이 답해야 하는 것은
      // '누가 만들었나'가 아니라 '지금 누가 관리하나'(담당자 컬럼)다. 생성자는 상세 페이지에만 남기며,
      // '내 기업 관리' 스코프는 계속 created_by를 조회 조건으로 쓴다(표시와 조회는 별개).
      showAuthor={false}
      emptyText="등록된 스타트업이 없습니다."
    />
  )
}
