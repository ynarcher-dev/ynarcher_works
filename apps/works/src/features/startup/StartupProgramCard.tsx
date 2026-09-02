import { DataTable, PanelCard, PersonCell, usePaged, type Column } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { programManagerNames } from '@/features/program/programManagerLabel'
import { categoryLabel, type ProgramWorkspaceConfig } from '@/features/program/workspace'
import type { StartupProgramRow } from '@/features/startup/startupProgramHooks'

/** 값이 없는 칸의 표기 — 표 안에서 '비어 있음'은 문장이 아니라 기호 하나로 답한다. */
const Dash = () => <span className="text-gray-400">-</span>

/** 카드 안 목록의 한 장 크기. 상세 우측 패널 목록(usePaged 기본값)과 같은 5건이다. */
const PAGE_SIZE = 5

/** 운영 기간 한 칸. 시작·종료를 두 열로 벌리면 카드 폭에서 사업명이 먼저 잘린다. */
function periodText(row: StartupProgramRow): string {
  if (!row.start_date && !row.end_date) return ''
  return `${row.start_date ?? '미정'} ~ ${row.end_date ?? '미정'}`
}

/**
 * 기업 상세 '관리 현황'의 참여 목록 카드 한 장(참여 사업 / 참여 M&A / 참여 프로젝트).
 *
 * 세 카드가 한 컴포넌트인 것은 사업 공용 모듈 원칙과 같은 축이다 — 원장만 물리적으로 다르고
 * 표가 답하는 물음은 동일하므로, 차이는 `ProgramWorkspaceConfig` 주입으로만 표현한다.
 *
 * 조회·노출 판정은 이 카드가 아니라 상위 섹션(StartupManagementSection)이 갖는다. 걸린 건이
 * 없으면 카드 자체가 서지 않으므로 여기에 빈 상태가 없다 — 이 컴포넌트는 행이 있을 때만 불린다.
 */
export function StartupProgramCard({
  config,
  title,
  rows,
}: {
  config: ProgramWorkspaceConfig
  /** 카드 제목(참여 사업·참여 M&A·참여 프로젝트). 워크스페이스 명사와 별개로 화면이 정한다. */
  title: string
  rows: StartupProgramRow[]
}) {
  const navigate = useNavigate()
  const { pageItems, page, setPage } = usePaged(rows, PAGE_SIZE)

  // 참여 성격 태그는 운용하는 사업에서만 채워진다 — 전 행이 비면 열 자체를 세우지 않는다.
  // 영원히 '-'만 찬 칸은 폭만 먹고 아무것도 답하지 않는다(목록의 '주관' 열과 같은 규칙).
  const hasRoleTags = rows.some((r) => r.roleTags.length > 0)

  const columns = useMemo<Column<StartupProgramRow>[]>(
    () => [
      {
        key: 'title',
        header: '사업명',
        type: 'name',
        render: (r) => <span title={r.title}>{r.title}</span>,
      },
      ...(config.categories.length
        ? [
            {
              key: 'category',
              header: '카테고리',
              type: 'text',
              render: (r: StartupProgramRow) =>
                r.category ? categoryLabel(config, r.category) ?? r.category : <Dash />,
            } satisfies Column<StartupProgramRow>,
          ]
        : []),
      ...(hasRoleTags
        ? [
            {
              key: 'roleTags',
              header: '참여 성격',
              type: 'text',
              render: (r: StartupProgramRow) =>
                r.roleTags.length ? (
                  <span title={r.roleTags.join(' · ')}>{r.roleTags.join(' · ')}</span>
                ) : (
                  <Dash />
                ),
            } satisfies Column<StartupProgramRow>,
          ]
        : []),
      {
        key: 'period',
        header: '운영 기간',
        type: 'long',
        render: (r) => {
          const text = periodText(r)
          return text ? (
            <span className="tabular-nums" title={text}>
              {text}
            </span>
          ) : (
            <Dash />
          )
        },
      },
      {
        key: 'managers',
        header: '담당자',
        type: 'person',
        // 폭이 허락하는 만큼 + `+N`. 사업 목록과 같은 규격을 공유한다(programManagerNames).
        render: (r) => (
          <PersonCell
            names={programManagerNames(r.managers)}
            empty={<span className="text-gray-400">미지정</span>}
          />
        ),
      },
    ],
    [config, hasRoleTags],
  )

  return (
    <PanelCard title={title} count={rows.length}>
      <DataTable
        columns={columns}
        rows={pageItems}
        rowKey={(r) => r.id}
        layout="fixed"
        onRowClick={(r) => navigate(`${config.basePath}/programs/${r.id}`)}
        standardColumns={false}
        // 카드 안 보조 목록이라 번호줄 없는 미니 페이저를 쓴다(우측 패널 목록과 같은 규격).
        pagination={{ page, pageSize: PAGE_SIZE, total: rows.length, onChange: setPage, compact: true }}
      />
    </PanelCard>
  )
}
