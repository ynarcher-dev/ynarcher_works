import {
  Badge,
  DataTable,
  PersonCell,
  TagCell,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import { useMemo } from 'react'
import { useDepartmentLabels } from '@/features/management/departmentOptions'
import { programManagerNames } from '@/features/program/programManagerLabel'
import {
  PROGRAM_STATUS_LABEL,
  PROGRAM_STATUS_TONE,
} from '@/features/program/config'
import { programIndustries, type Program } from '@/features/program/hooks'
import {
  programDepartmentText,
  summarizeProgramDepartments,
} from '@/features/program/programDepartmentSummary'
import { categoryLabel, useProgramWorkspace } from '@/features/program/workspace'

interface ProgramTableProps {
  rows: Program[]
  onRowClick?: (row: Program) => void
  /** 행 다중선택 키(controlled). 상위가 소유한다. */
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** 서버 사이드 페이지네이션(0-base). DataTable로 그대로 전달된다. */
  pagination?: DataTableProps<Program>['pagination']
}

/**
 * 프로그램 원장 공용 데이터 테이블(STARTUP StartupPoolTable과 동일 규격).
 * 컬럼: 체크박스·No.·사업명·코드·카테고리·담당 부서·분야·상태·운영 시작일·운영 종료일·담당자.
 * 카테고리는 워크스페이스가 그 축을 운용할 때만 선다(config 주입). 주관은 상세에만 둔다.
 * 비활성화(삭제)는 목록이 아니라 상세 페이지에서 수행하므로 관리 컬럼(showManageColumn=false)은 두지 않는다.
 */
export function ProgramTable({
  rows,
  onRowClick,
  selectedKeys,
  onSelectionChange,
  pagination,
}: ProgramTableProps) {
  const config = useProgramWorkspace()
  // 부서 표기는 상위 경로가 필요해 조직도 원장을 경유한다(임베드로는 자기 이름까지만 온다).
  const { pathLabelOf, lineageOf } = useDepartmentLabels()
  // 담당자·생성자는 내부 임직원이라 민감정보 마스킹 대상이 아니다(외부 신청 기업 정보만 가린다).
  const columns = useMemo<Column<Program>[]>(
    () => [
      {
        // 사업명(식별 열). 폭·정렬은 종류(type)가 정한다 — 수동 w-*를 적지 않는다.
        // 넘치면 말줄임 + 툴팁(layout="fixed"가 계산 폭을 지키고 넘치는 글자를 자른다).
        key: 'title',
        header: '사업명',
        type: 'name',
        render: (r) => <span title={r.title}>{r.title}</span>,
      },
      {
        // 사업코드(6자리 영숫자 난수). 목록에서는 다른 컬럼과 동일한 본문 텍스트로 노출한다.
        key: 'code',
        header: '코드',
        // 6자리 영숫자 난수라 길이의 상한이 정해져 있다 — 가변폭으로 두면 폭만 비운다.
        type: 'code',
        render: (r) => r.code ?? <span className="text-gray-400">-</span>,
      },
      // 사업구분. 워크스페이스가 분류를 운용하지 않으면(categories 비어 있음) 컬럼 자체를 감춘다.
      ...(config.categories.length
        ? [
            {
              // 다른 컬럼과 동일한 본문 텍스트로 노출한다.
              key: 'category',
              header: '카테고리',
              // 선택지가 정해진 값(공공·민간·매출·신규·기타)이라 두 글자에 고정폭이면 충분하다.
              type: 'code',
              render: (r: Program) =>
                r.category ? (
                  categoryLabel(config, r.category) ?? r.category
                ) : (
                  <span className="text-gray-400">-</span>
                ),
            } satisfies Column<Program>,
          ]
        : []),
      // 주관(발주·주관 기관/기업)은 목록에 두지 않는다(2026-09-01) — AC에서만 값이 차는 열이라
      // M&A·PROJECT에서는 영원히 비고, AC에서도 사업을 고르는 축이 아니라 고른 뒤 확인할 값이다.
      // 상세(ProgramInfoCard)에 남기고, 목록에서 그 몫의 폭은 사업명·담당 부서·분야가 나눠 갖는다.
      {
        // 담당 부서: 메인 부서 한 곳만 경로로 적고 나머지는 '외 N'으로 접는다.
        // 경로가 길어지면 칸을 넓히지 않고 말줄임한다(넓히면 분야가 그만큼 사라진다).
        key: 'departments',
        header: '담당 부서',
        type: 'long',
        render: (r) => {
          const summary = summarizeProgramDepartments(r.departments ?? [], lineageOf)
          if (!summary) return <span className="text-gray-400">미지정</span>
          // 조직도를 아직 못 읽었으면 부서명이 빈칸이 된다 — 그때 '외 N'만 남기면 무엇의 '외'인지
          // 알 수 없으므로 한 칸을 통째로 비운다(조직도가 도착하면 다시 채워진다).
          if (!pathLabelOf(summary.mainDepartmentId)) return <span className="text-gray-400">-</span>
          const text = programDepartmentText(summary, pathLabelOf)
          // 말줄임된 경로는 마우스를 올려 전체를 확인할 수 있어야 한다.
          return <span title={text}>{text}</span>
        },
      },
      {
        // 분야. 값이 여러 개인 태그라 스타트업 목록(StartupPoolTable)과 같은 규격으로 적는다 —
        // 같은 태그 원장(industry_tags)을 읽는 두 열이 서로 다르게 그려지면 같은 값을 두 화면이
        // 다르게 부르는 것이 된다.
        //
        // 2026-09-01에 배지 나열에서 한 줄 텍스트(TagCell)로 되돌렸다. 이 주석은 원래 "StartupPool과
        // 같은 규격"이라 적혀 있었지만 그 화면은 2026-08-20에 텍스트로 옮겨 갔고, 그 뒤로는 근거가
        // 뒤집힌 채 배지만 남아 있었다. 배지 줄은 폭이 모자랄 때 배지 한 개의 중간에서 잘려
        // 반쪽이 남는데, 그것은 압축이 아니라 화면이 깨진 것으로 읽힌다.
        key: 'industries',
        header: '분야',
        type: 'tags',
        render: (r) => <TagCell items={programIndustries(r)} />,
      },
      {
        key: 'status',
        header: '상태',
        type: 'badge',
        render: (r) => (
          <Badge tone={PROGRAM_STATUS_TONE[r.status] ?? 'neutral'}>
            {PROGRAM_STATUS_LABEL[r.status] ?? r.status}
          </Badge>
        ),
      },
      {
        key: 'start_date',
        header: '운영 시작일',
        type: 'date',
        render: (r) => r.start_date ?? <span className="text-gray-400">-</span>,
      },
      {
        key: 'end_date',
        header: '운영 종료일',
        type: 'date',
        render: (r) => r.end_date ?? <span className="text-gray-400">-</span>,
      },
      {
        key: 'managers',
        header: '담당자',
        type: 'person',
        // 열 폭이 허락하는 만큼 이름을 적고 넘치는 수만 `+N`으로 알린다(공용 `PersonCell`).
        // 담당자는 사람당 구간이 여러 개일 수 있으므로 먼저 사람 단위로 접은 뒤 넘긴다.
        render: (r) => (
          <PersonCell
            names={programManagerNames(r.managers)}
            empty={<span className="text-gray-400">미지정</span>}
          />
        ),
      },
    ],
    [config, pathLabelOf, lineageOf],
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      // 폭은 열마다의 type이 계산하되 fixed로 못박는다. 자동 레이아웃은 내용이 긴 열이
      // 폭을 가져가 값이 여러 개인 열(분야)을 줄바꿈시키는데, 한 행만 두 줄이 되면 행 높이가
      // 어긋나 표가 들쭉날쭉해진다. 고정 폭에서는 모든 값이 한 줄로 서고 넘치면 말줄임된다.
      layout="fixed"
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      pagination={pagination}
      showManageColumn={false}
      // 생성자(created_by)는 권한 축이 아니라 목록에서 내린다 — 관리 주체는 담당자 컬럼이 답한다.
      // 생성자는 상세 페이지(ProgramInfoCard)에만 남고, '내 사업 관리' 스코프는 계속 created_by를 함께 본다.
      showAuthor={false}
      emptyText="등록된 사업이 없습니다."
    />
  )
}
