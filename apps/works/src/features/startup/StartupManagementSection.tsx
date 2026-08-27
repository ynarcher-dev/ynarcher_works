import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { AC_WORKSPACE } from '@/features/ac/AcWorkspace'
import { MNA_WORKSPACE } from '@/features/mna/MnaWorkspace'
import { PROJECT_WORKSPACE } from '@/features/project/ProjectWorkspace'
import type { ProgramWorkspaceConfig } from '@/features/program/workspace'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { StartupManagerCard } from '@/features/startup/StartupManagerCard'
import { StartupProgramCard } from '@/features/startup/StartupProgramCard'
import { useStartupPrograms } from '@/features/startup/startupProgramHooks'
import type { StartupManagerRow } from '@/features/startup/startupPoolHooks'

/** 참여 목록 카드 한 장의 조회 결과. 걸린 건이 없으면 카드를 세우지 않는다. */
interface ParticipationCard {
  config: ProgramWorkspaceConfig
  title: string
  rows: ReturnType<typeof useStartupPrograms>['data']
  isLoading: boolean
}

/**
 * 이 워크스페이스를 읽을 수 있을 때만 조회한다. 권한이 없으면 RLS가 참가자 행부터 막아
 * 어차피 0건이므로, 질의를 보내는 것 자체가 낭비다.
 */
function useParticipation(config: ProgramWorkspaceConfig, title: string, startupId: string): ParticipationCard {
  const user = useAuthStore((s) => s.user)
  const readable = hasWorkspaceRead(user, config.key)
  const { data, isLoading } = useStartupPrograms(config, readable ? startupId : undefined)
  return { config, title, rows: data, isLoading: readable && isLoading }
}

/**
 * 기업 상세의 '관리 현황' 섹션 — 담당자 + 사업 원장 3종의 참여 목록.
 *
 * **연결된 것이 없으면 카드도 헤딩도 서지 않는다.** 이전에는 여섯 장이 늘 서 있었고 전부
 * "준비 중입니다."라고 적혀 있었다. 빈 카드는 두 가지를 한꺼번에 잘못 말한다 — 있지도 않은
 * 관계가 있는 것처럼 자리를 잡고, 정작 실제로 연결된 한 장을 다섯 장의 빈 상자 사이에 묻는다.
 *
 * 열람 권한이 없어 0건인 경우도 함께 감춘다. 권한이 없다는 사실은 그 워크스페이스에서 답할
 * 일이지, 기업 상세가 볼 수 없는 것의 목록을 늘어놓을 자리는 아니다.
 *
 * 담당자 카드만 예외로 늘 선다(투자기업이면 표, 비투자면 '공동관리' 문장) — 관리 주체는
 * 어느 기업에나 반드시 있고, 비어 있다는 사실 자체가 "아직 아무도 지정되지 않았다"는 답이다.
 */
export function StartupManagementSection({
  startupId,
  invested,
  managers,
}: {
  startupId: string
  invested: boolean
  managers: StartupManagerRow[]
}) {
  const ac = useParticipation(AC_WORKSPACE, '참여 사업', startupId)
  const mna = useParticipation(MNA_WORKSPACE, '참여 M&A', startupId)
  const project = useParticipation(PROJECT_WORKSPACE, '참여 프로젝트', startupId)

  const cards = [ac, mna, project]
  // 조회 중에는 아직 아무것도 판정하지 않는다 — 빈 카드가 잠깐 떴다 사라지는 편보다
  // 결론이 난 뒤 한 번에 서는 편이 낫다.
  if (cards.some((c) => c.isLoading)) return null

  const filled = cards.filter((c) => (c.rows?.length ?? 0) > 0)

  return (
    <>
      <SectionHeading title="관리 현황" />
      <StartupManagerCard invested={invested} managers={managers} />
      {filled.map((c) => (
        <StartupProgramCard key={c.config.key} config={c.config} title={c.title} rows={c.rows ?? []} />
      ))}
    </>
  )
}
