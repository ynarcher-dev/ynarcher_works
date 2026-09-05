import { Badge, InfoRows, PanelCard } from '@ynarcher/ui'
import { rows } from '@/features/startup/startupCardRows'
import { EmptyLine } from '@/features/startup/StartupCardEmpty'
import type { TeamMember, TeamProfile } from '@/features/startup/startupProfile'
import type { ShareholderSnapshot } from '@/features/startup/startupShareholders'

/**
 * 대표자의 최신 지분율을 주주 구성 이력에서 **파생**한다(저장하지 않는다).
 *
 * 창업자 지분율은 심사에서 늘 확인하는 값이지만 팀 카드에 칸을 만들지 않는다 — 이미
 * `shareholders`의 최신 스냅샷이 아는 값이라, 적어 두면 캡테이블을 고쳤을 때 이 칸만 옛 값으로
 * 남는다. 이름이 정확히 일치하는 주주만 본다(부분 일치로 넓히면 동명 계열사·법인 주주가 걸린다).
 */
function founderStake(history: ShareholderSnapshot[], representative?: string | null): number | null {
  const name = (representative ?? '').trim()
  if (!name || history.length === 0) return null
  const latest = history[0]
  const hit = latest?.holders.find((h) => (h.name ?? '').trim() === name)
  return hit?.percentage ?? null
}

/** 팀원 한 줄. 이름은 진하게, 나머지 사실은 같은 크기의 연한 색으로 이어 붙인다. */
function MemberLine({ member }: { member: TeamMember }) {
  const facts = [member.role, member.employment, member.joinedAt && `${member.joinedAt} 합류`]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
  return (
    <li>
      <span className="font-medium">{member.name}</span>
      {facts.length > 0 && <span className="text-gray-500"> · {facts.join(' · ')}</span>}
      {member.hasEquity && (
        <Badge tone="neutral" className="ml-1.5">
          지분 보유
        </Badge>
      )}
      {member.background && <span className="text-gray-500"> — {member.background}</span>}
    </li>
  )
}

interface Props {
  team: TeamProfile
  /** 주주 구성 이력(최신순) — 대표자 지분율 파생용. */
  shareholders: ShareholderSnapshot[]
  /** 원장의 대표자명. 주주 목록에서 창업자 줄을 찾는 키다. */
  representative?: string | null
}

/**
 * 팀·조직 카드(역량 밴드). 읽기 전용 표시.
 *
 * 팀원의 `재직 형태`·`합류 시점`·`지분 보유`는 한때 한 줄 설명(background) 자유 텍스트에
 * 적히거나 적히지 않았다. 그중 재직 형태(전업·겸업)는 초기 기업 심사의 실질 리스크 1번이라
 * 칸으로 올린다 — 칸이 되면 비어 있다는 사실 자체가 보이고, 나중에 목록에서 걸러볼 수도 있다.
 *
 * 총 인원은 여기 적지 않는다(실적 밴드의 고용 표가 답한다). 조직 구성은 '몇 명인가'가 아니라
 * '어느 기능에 사람이 있는가'라 지금의 상태이고, 그래서 역량 쪽이다.
 */
export function StartupTeamCard({ team, shareholders, representative }: Props) {
  const members = team.members ?? []
  const capabilities = team.capabilities ?? []
  const advisors = team.advisors ?? []
  const stake = founderStake(shareholders, representative)
  const isEmpty =
    !team.founderStrength &&
    !team.orgComposition &&
    !team.hiringPlan &&
    members.length === 0 &&
    capabilities.length === 0 &&
    advisors.length === 0

  return (
    <PanelCard title="팀·조직">
      {isEmpty ? (
        <EmptyLine noun="팀·조직" />
      ) : (
        <InfoRows
          items={rows([
            { label: '창업자 역량', value: team.founderStrength, multiline: true },
            // 파생 표시(원장에 없는 값) — 주주 구성 최신 스냅샷에서 대표자 줄을 찾는다.
            { label: '대표 지분율', value: stake == null ? '' : `${stake}%` },
            {
              label: '핵심 팀원',
              value: members.length > 0 && (
                <ul className="space-y-1">
                  {members.map((m, i) => (
                    <MemberLine key={i} member={m} />
                  ))}
                </ul>
              ),
            },
            { label: '조직 구성', value: team.orgComposition, multiline: true },
            { label: '채용 계획', value: team.hiringPlan, multiline: true },
            {
              label: '자문단',
              value: advisors.length > 0 && (
                <ul className="space-y-1">
                  {advisors.map((a, i) => (
                    <li key={i}>
                      <span className="font-medium">{a.name}</span>
                      {(a.affiliation || a.role) && (
                        <span className="text-gray-500">
                          {' · '}
                          {[a.affiliation, a.role].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              label: '핵심 역량',
              value: capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {capabilities.map((c) => (
                    <Badge key={c} tone="neutral">
                      {c}
                    </Badge>
                  ))}
                </div>
              ),
            },
          ])}
        />
      )}
    </PanelCard>
  )
}
