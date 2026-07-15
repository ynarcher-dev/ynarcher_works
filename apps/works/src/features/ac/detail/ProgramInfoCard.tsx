import { Badge } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { Program } from '@/features/ac/hooks'
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
  const period =
    program.start_date || program.end_date
      ? `${program.start_date ?? '?'} ~ ${program.end_date ?? '?'}`
      : '-'
  // 담당자는 사람 단위로 그룹화(구간이 여러 개일 수 있음). 한 구간이라도 PM이면 PM으로 표기.
  const byUser = new Map<string, { name: string; isPM: boolean }>()
  for (const m of program.managers ?? []) {
    const cur = byUser.get(m.user_id) ?? { name: m.user?.name ?? '-', isPM: false }
    cur.isPM = cur.isPM || m.role === 'PM'
    byUser.set(m.user_id, cur)
  }
  const managers = [...byUser.entries()]
    .map(([user_id, v]) => ({ user_id, ...v }))
    .sort((a, b) => Number(b.isPM) - Number(a.isPM))
  // 부서 구성: 메인 먼저, 협업비율 내림차순.
  const departments = [...(program.departments ?? [])].sort(
    (a, b) => Number(b.kind === 'MAIN') - Number(a.kind === 'MAIN') || b.collaboration_ratio - a.collaboration_ratio,
  )

  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
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
        <Info label="기간" value={period} />
        <Info
          label="부서"
          value={
            departments.length ? (
              <span className="flex flex-wrap gap-1">
                {departments.map((d) => (
                  <Badge key={d.department_id} tone={d.kind === 'MAIN' ? 'info' : 'neutral'} size="sm">
                    {(d.department?.name ?? '-') +
                      (d.kind === 'MAIN' ? ' · 메인' : '') +
                      ` ${d.collaboration_ratio}%`}
                  </Badge>
                ))}
              </span>
            ) : (
              '-'
            )
          }
        />
        <Info
          label="담당자"
          value={
            managers.length ? (
              <span className="flex flex-wrap gap-1">
                {managers.map((m) => (
                  <Badge key={m.user_id} tone={m.isPM ? 'info' : 'neutral'} size="sm">
                    {m.name + (m.isPM ? ' · PM' : '')}
                  </Badge>
                ))}
              </span>
            ) : (
              '-'
            )
          }
        />
        <Info label="등록자" value={program.creator?.name || '-'} />
        <Info label="수정일" value={formatDate(program.updated_at)} />
      </div>
    </section>
  )
}
