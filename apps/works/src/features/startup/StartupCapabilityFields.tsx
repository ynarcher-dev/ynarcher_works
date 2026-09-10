import { PanelCard } from '@ynarcher/ui'
import type { Control, UseFormRegister } from 'react-hook-form'
import { SectionHeading } from '@/components/SectionHeading'
import { StartupBusinessFields } from '@/features/startup/StartupBusinessFields'
import { StartupCertFields } from '@/features/startup/StartupCertFields'
import { StartupIpFields } from '@/features/startup/StartupIpFields'
import { StartupTeamFields } from '@/features/startup/StartupTeamFields'
import { StartupTechFields } from '@/features/startup/StartupTechFields'
import type { IpProfile } from '@/features/startup/startupProfile'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

interface Props {
  register: UseFormRegister<StartupDetailFormValues>
  control: Control<StartupDetailFormValues>
  capabilities: string[]
  setCapabilities: (c: string[]) => void
  ip: IpProfile
  setIp: (v: IpProfile) => void
  /** 지금 폼에 적힌 기업명. 핵심 팀원을 새 인물로 등록할 때 소속으로 채운다. */
  companyName: string
}

/**
 * 역량 밴드 입력(조회의 `StartupCapabilitySection`과 짝).
 *
 * 카드 넷을 조회 화면과 같은 **1열**로 세운다(2026-09-06 개정, 종전 2×2). 한때 조회만 2열이고
 * 입력만 1열이던 시절이 있었는데 그때 문제는 열 수가 아니라 **둘이 달랐다**는 것이었다 —
 * 편집과 조회의 카드 배열이 다르면 방금 적은 값이 어느 카드로 가는지 화면이 답하지 못한다.
 * 그래서 열 수를 맞추는 규칙은 그대로 두고, 맞추는 값만 1열로 옮겼다. 폼에서는 이 편이 더
 * 낫기도 하다 — 절반 폭에서 3행짜리 텍스트영역은 한 줄이 어디서 끝나는지 눈이 따라가기
 * 어려웠고, 전폭에서는 카드 안의 2열 격자가 그 폭을 나눠 받는다.
 */
export function StartupCapabilityFields({
  register,
  control,
  capabilities,
  setCapabilities,
  ip,
  setIp,
  companyName,
}: Props) {
  return (
    <>
      <SectionHeading title="역량" />
      <div className="space-y-4">
        <PanelCard title="비즈니스">
          <StartupBusinessFields register={register} />
        </PanelCard>

        <PanelCard title="제품·기술">
          <StartupTechFields register={register} />
        </PanelCard>

        <PanelCard title="팀·조직">
          <StartupTeamFields
            register={register}
            control={control}
            capabilities={capabilities}
            setCapabilities={setCapabilities}
            companyName={companyName}
          />
        </PanelCard>

        <PanelCard title="지식재산">
          <StartupIpFields ip={ip} setIp={setIp} />
        </PanelCard>

        <PanelCard title="인증·정부과제">
          <StartupCertFields ip={ip} setIp={setIp} />
        </PanelCard>
      </div>
    </>
  )
}
