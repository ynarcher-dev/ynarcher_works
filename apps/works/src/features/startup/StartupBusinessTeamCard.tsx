import { Badge } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { EntityRow } from '@/features/networks/hooks'

/** 비즈니스 정성 정보(startups.business_profile). */
export interface BusinessProfile {
  oneLiner?: string
  businessModel?: string
  targetMarket?: string
  competitiveEdge?: string
}

/** 핵심 팀원 1인. */
export interface TeamMember {
  name: string
  role: string
  background: string
}

/** 팀 역량 정보(startups.team_profile). */
export interface TeamProfile {
  founderStrength?: string
  members?: TeamMember[]
  capabilities?: string[]
}

/** jsonb 컬럼을 안전하게 객체로 읽는다. */
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export function readBusiness(record: EntityRow): BusinessProfile {
  const o = asObject(record.business_profile)
  return {
    oneLiner: (o.oneLiner as string) ?? '',
    businessModel: (o.businessModel as string) ?? '',
    targetMarket: (o.targetMarket as string) ?? '',
    competitiveEdge: (o.competitiveEdge as string) ?? '',
  }
}

export function readTeam(record: EntityRow): TeamProfile {
  const o = asObject(record.team_profile)
  const members = Array.isArray(o.members) ? (o.members as TeamMember[]) : []
  const capabilities = Array.isArray(o.capabilities) ? (o.capabilities as string[]) : []
  return { founderStrength: (o.founderStrength as string) ?? '', members, capabilities }
}

/** 카테고리 라벨(포인트색) + 본문(줄바꿈 보존). 값 없으면 렌더 안 함. */
function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <p className="mb-0.5 text-caption font-semibold text-brand">{label}</p>
      <p className="whitespace-pre-wrap text-body leading-relaxed text-gray-800">{value}</p>
    </div>
  )
}

function SubHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-gray-200 pb-1 text-body font-semibold text-gray-900">{children}</h3>
  )
}

interface Props {
  business: BusinessProfile
  team: TeamProfile
}

/**
 * 비즈니스 & 팀 역량 카드(스타트업 상세, 담당자 카드 아래). 읽기 전용 표시.
 * 편집은 상단 '수정'(통합 수정 폼)에서 기본 데이터와 함께 관리한다.
 */
export function StartupBusinessTeamCard({ business, team }: Props) {
  const members = team.members ?? []
  const capabilities = team.capabilities ?? []
  // 한 줄 소개(oneLiner)는 기본 데이터 헤더로 이동해 이 카드에서는 표시하지 않는다.
  const isEmpty =
    !business.businessModel &&
    !business.targetMarket &&
    !business.competitiveEdge &&
    !team.founderStrength &&
    members.length === 0 &&
    capabilities.length === 0

  return (
    <section className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">
      {isEmpty ? (
        <p className="text-body text-gray-400">
          등록된 비즈니스 · 팀 역량 정보가 없습니다. "수정"에서 입력하세요.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <SubHead>비즈니스</SubHead>
            <Field label="비즈니스 모델" value={business.businessModel} />
            <Field label="타겟 시장 &amp; 고객" value={business.targetMarket} />
            <Field label="경쟁 우위 / 차별점" value={business.competitiveEdge} />
          </div>

          <div className="space-y-3">
            <SubHead>팀 역량</SubHead>
            <Field label="대표 / 창업자 역량" value={team.founderStrength} />
            {members.length > 0 && (
              <div>
                <p className="mb-0.5 text-caption font-semibold text-brand">핵심 팀원</p>
                <ul className="mt-1 space-y-1">
                  {members.map((m, i) => (
                    <li key={i} className="text-body text-gray-800">
                      <span className="font-medium">{m.name}</span>
                      {m.role && <span className="text-gray-500"> · {m.role}</span>}
                      {m.background && <span className="text-gray-500"> — {m.background}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {capabilities.length > 0 && (
              <div>
                <p className="mb-1 text-caption font-semibold text-brand">핵심 역량</p>
                <div className="flex flex-wrap gap-1">
                  {capabilities.map((c) => (
                    <Badge key={c} tone="neutral" size="sm">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
