import { Badge, DataTable, PanelCard, Spinner, type Column } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, hasWorkspaceRead } from '@/auth/authStore'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/program/config'
import { programManagerLabel } from '@/features/program/programManagerLabel'
import { categoryLabel, type ProgramWorkspaceConfig } from '@/features/program/workspace'
import { useStartupPrograms, type StartupProgramRow } from '@/features/startup/startupProgramHooks'

/** 값이 없는 칸의 표기 — 표 안에서 '비어 있음'은 문장이 아니라 기호 하나로 답한다. */
const Dash = () => <span className="text-gray-400">-</span>

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
 * **빈 표와 '볼 수 없는 표'를 구분해 말한다.** 참가자 원장의 RLS는 그 워크스페이스 열람
 * 권한을 먼저 보므로, 권한이 없는 사람에게는 참여 중인 사업이 있어도 0건이 온다. 그것을
 * '참여 없음'이라고 적으면 화면이 사실이 아닌 말을 하게 된다.
 */
export function StartupProgramCard({
  config,
  title,
  startupId,
}: {
  config: ProgramWorkspaceConfig
  /** 카드 제목(참여 사업·참여 M&A·참여 프로젝트). 워크스페이스 명사와 별개로 화면이 정한다. */
  title: string
  startupId: string
}) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const readable = hasWorkspaceRead(user, config.key)
  const { data, isLoading } = useStartupPrograms(config, readable ? startupId : undefined)
  const rows = data ?? []

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
        // 대표(PM) 1명 + "외 N". 사업 목록과 같은 규격을 공유한다(programManagerLabel).
        render: (r) => programManagerLabel(r.managers) ?? <span className="text-gray-400">미지정</span>,
      },
    ],
    [config, hasRoleTags],
  )

  return (
    <PanelCard title={title} count={readable ? rows.length : undefined}>
      {!readable ? (
        <p className="text-body text-gray-600">
          열람 권한이 없어 표시할 수 없습니다.
        </p>
      ) : isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          layout="fixed"
          onRowClick={(r) => navigate(`${config.basePath}/programs/${r.id}`)}
          standardColumns={false}
          emptyText="참여 중인 건이 없습니다."
        />
      )}
    </PanelCard>
  )
}
