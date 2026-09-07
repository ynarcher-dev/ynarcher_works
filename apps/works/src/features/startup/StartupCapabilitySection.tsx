import type { EntityRow } from '@/features/master/entityHooks'
import { SectionHeading } from '@/components/SectionHeading'
import { StartupBusinessCard } from '@/features/startup/StartupBusinessCard'
import { StartupIpCard } from '@/features/startup/StartupIpCard'
import { StartupTeamCard } from '@/features/startup/StartupTeamCard'
import { StartupTechCard } from '@/features/startup/StartupTechCard'
import { readBusiness, readIp, readTeam, readTech } from '@/features/startup/startupProfile'
import { readShareholderHistory } from '@/features/startup/startupShareholders'

/**
 * 역량 밴드 — "이 기업이 무엇을 가졌는가".
 *
 * 밴드에 서는 것은 **다시 재지 않는 값**이다. 특허는 취득일이 있어도 여기고(쌓인다),
 * 고용 인원은 사람 이야기여도 실적 밴드다(기간마다 다시 잰다). 종전 이 자리의 이름은
 * '기업 개요'였는데 무엇이든 담을 수 있는 이름이라 축이 되지 못했고, 실제로 새 카드가 갈 곳을
 * 못 정하는 원인이 그 이름이었다.
 *
 * **카드는 1열로 쌓는다**(2026-09-06 개정). 종전에는 2열이었고 근거는 짝이었다 — 제품·기술과
 * 지식재산을 나란히 봐야 "말하는 기술"과 "확보한 권리"가 맞는지 읽힌다는 것이었다. 그러나
 * 카드가 넷이 되면서 2×2 격자는 짝을 만들어 주지 못했다(대각선에 놓인 둘은 나란하지 않다).
 * 대신 절반 폭에서 각 카드의 라벨:값 줄이 접혀, 나란히 보려던 그 값들이 정작 두 줄씩 접혀
 * 읽혔다. 1열은 카드 하나가 전폭을 받아 한 줄이 한 줄로 서고, 견줄 짝은 스크롤 한 번 거리에
 * 있다 — 접힌 줄을 나란히 두는 것보다 편 줄을 위아래로 두는 편이 실제로 더 빨리 읽힌다.
 *
 * 빈 상태는 **카드가 아니라 밴드가** 답한다. 카드 단위 빈 상태는 카드가 둘일 때 맞는 처리였고,
 * 넷이 된 지금 전부 비면 같은 문장이 넷 서서 안내문의 벽이 된다. 하나라도 채워지면 카드 넷이
 * 그대로 서고, 빈 카드는 자기 몫의 한 줄로 답한다(빈 상태를 접지 않는다는 원칙은 그대로다).
 */
export function StartupCapabilitySection({ record }: { record: EntityRow }) {
  const business = readBusiness(record)
  const tech = readTech(record)
  const team = readTeam(record)
  const ip = readIp(record)

  const hasBusiness = Boolean(
    business.businessModel || business.targetMarket || business.revenueModel || business.salesChannel || business.supplyMode,
  )
  const hasTech = Boolean(
    tech.product || tech.devStage || tech.coreTech || tech.devInsourcing || tech.differentiator,
  )
  const hasTeam = Boolean(
    team.founderStrength ||
      team.orgComposition ||
      team.hiringPlan ||
      (team.members ?? []).length > 0 ||
      (team.capabilities ?? []).length > 0 ||
      (team.advisors ?? []).length > 0,
  )
  const hasIp = ip.rights.length > 0 || ip.certifications.length > 0 || ip.govProjects.length > 0
  const bandEmpty = !hasBusiness && !hasTech && !hasTeam && !hasIp

  return (
    <section className="space-y-4">
      <SectionHeading title="역량" />
      {bandEmpty ? (
        <p className="text-body text-gray-600">
          비즈니스·제품·팀·지식재산 정보가 아직 없습니다. "수정"에서 입력하세요.
        </p>
      ) : (
        <div className="space-y-4">
          <StartupBusinessCard business={business} />
          <StartupTechCard tech={tech} />
          <StartupTeamCard
            team={team}
            shareholders={readShareholderHistory(record)}
            representative={record.representative == null ? null : String(record.representative)}
          />
          <StartupIpCard ip={ip} />
        </div>
      )}
    </section>
  )
}
