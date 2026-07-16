import { Badge } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { Program, ProgramDepartmentKind } from '@/features/ac/hooks'
import { ProgramPhotoBox } from '@/features/ac/detail/ProgramPhotoBox'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/ac/config'

/** 라벨: 값 한 줄(StartupDetailPage·NetworkDetailPage의 Info와 동일 톤). */
function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-caption text-gray-400">{label}:</span>
      <span className="text-body text-gray-800">{value ?? '-'}</span>
    </div>
  )
}

function formatDate(v: unknown): string {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : '-'
}

/**
 * 프로그램 기본 데이터 카드(상세 개요 좌측 최상단).
 * NETWORKS·STARTUP 상세의 '기본 데이터' 카드와 CSS·레이아웃을 동일하게 맞춘다 —
 * 좌측 커버 이미지(ProgramPhotoBox) + 제목/상태 배지 + 부제(설명) + 정보 그리드(border-t 구분, 3열).
 * 편집은 상단 슬림 헤더의 '편집' 버튼에서 수행한다. (커버 이미지 필드 연동은 후속.)
 */
export function ProgramInfoCard({ program }: { program: Program }) {
  // 기간 이원화: 제안 기간(제안서 작성~발표)과 운영 기간(실제 행사 관리)을 각각 표시한다.
  const formatPeriod = (start: string | null, end: string | null) =>
    start || end ? `${start ?? '?'} ~ ${end ?? '?'}` : '-'
  const proposalPeriod = formatPeriod(program.proposal_start_date, program.proposal_end_date)
  const operationPeriod = formatPeriod(program.start_date, program.end_date)
  // 담당자를 부서별로 묶는다. 담당자는 단계(org 버전)·기간 세그먼트로 쪼개져 한 부서 안에서도
  // 한 사람이 여러 구간(투입률 상이)을 가질 수 있으므로, 부서·사람 단위로 합쳐 대표 투입률(구간 중
  // 최대치)로 요약한다. 한 구간이라도 PM이면 PM으로 표기.
  type Member = { user_id: string; name: string; isPM: boolean; rate: number }
  const deptGroups = new Map<
    string,
    { name: string; kind: ProgramDepartmentKind | null; ratio: number | null; members: Map<string, Member> }
  >()
  // 부서 구성으로 먼저 채워 담당자 미배정 부서도 노출한다. 단계별 중복 시 메인 우선·협업비율 최대치.
  for (const d of program.departments ?? []) {
    const g = deptGroups.get(d.department_id)
    if (g) {
      if (d.kind === 'MAIN') g.kind = 'MAIN'
      g.ratio = Math.max(g.ratio ?? 0, d.collaboration_ratio)
    } else {
      deptGroups.set(d.department_id, {
        name: d.department?.name ?? '-',
        kind: d.kind,
        ratio: d.collaboration_ratio,
        members: new Map(),
      })
    }
  }
  for (const m of program.managers ?? []) {
    let g = deptGroups.get(m.department_id)
    if (!g) {
      g = { name: m.department?.name ?? '-', kind: null, ratio: null, members: new Map() }
      deptGroups.set(m.department_id, g)
    }
    const cur = g.members.get(m.user_id) ?? { user_id: m.user_id, name: m.user?.name ?? '-', isPM: false, rate: 0 }
    cur.isPM = cur.isPM || m.role === 'PM'
    cur.rate = Math.max(cur.rate, m.allocation_rate)
    g.members.set(m.user_id, cur)
  }
  // 표시 순서: 메인 부서 먼저, 협업비율 내림차순. 부서 내 담당자는 PM 먼저.
  const departments = [...deptGroups.entries()]
    .map(([department_id, g]) => ({
      department_id,
      ...g,
      members: [...g.members.values()].sort((a, b) => Number(b.isPM) - Number(a.isPM)),
    }))
    .sort(
      (a, b) => Number(b.kind === 'MAIN') - Number(a.kind === 'MAIN') || (b.ratio ?? 0) - (a.ratio ?? 0),
    )

  return (
    <section className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-5">
        <ProgramPhotoBox src={null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-title-md font-bold text-gray-900">{program.title}</h1>
            <Badge tone={PROGRAM_STATUS_TONE[program.status] ?? 'neutral'} size="sm">
              {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
            </Badge>
          </div>
          <p className="mt-1 text-body text-gray-500">{program.description || '-'}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
        <Info label="제안 기간" value={proposalPeriod} />
        <Info label="운영 기간" value={operationPeriod} />
        <Info label="등록자" value={program.creator?.name || '-'} />
        <Info label="수정일" value={formatDate(program.updated_at)} />
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <span className="text-caption text-gray-400">담당자</span>
        {departments.length ? (
          <div className="mt-2 flex flex-col gap-2">
            {departments.map((d) => (
              <div key={d.department_id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Badge tone={d.kind === 'MAIN' ? 'info' : 'neutral'} size="sm">
                  {d.name + (d.kind === 'MAIN' ? ' · 메인' : '') + (d.ratio != null ? ` ${d.ratio}%` : '')}
                </Badge>
                <span className="text-caption text-gray-300">/</span>
                {d.members.length ? (
                  <span className="flex flex-wrap gap-1">
                    {d.members.map((m) => (
                      <Badge key={m.user_id} tone={m.isPM ? 'info' : 'neutral'} size="sm">
                        {m.name + (m.isPM ? ' · PM' : '') + ` (${m.rate}%)`}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-caption text-gray-400">담당자 미배정</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-body text-gray-800">-</p>
        )}
      </div>
    </section>
  )
}
