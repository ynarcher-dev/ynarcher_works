import { PanelCard } from '@ynarcher/ui'
import type { Control, UseFormRegister } from 'react-hook-form'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { StartupBusinessFields } from '@/features/startup/StartupBusinessFields'
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
}

/**
 * 역량 밴드 입력(조회의 `StartupCapabilitySection`과 짝).
 *
 * 카드 넷을 조회 화면과 같은 **2×2**로 세운다. 한때 입력만 1열로 쌓았고 근거는 "읽을 때는
 * 제품과 지식재산을 나란히 견주지만 적을 때는 한 칸씩 채운다"였는데, 그 결과 3행짜리
 * 텍스트영역이 화면 절반을 넘게 늘어나 한 줄이 어디서 끝나는지 눈이 따라가지 못했다 —
 * 폼에서 폭은 미덕이 아니라 비용이다. 게다가 편집과 조회의 카드 배열이 다르면 방금 적은 값이
 * 어느 카드로 가는지 화면이 답하지 못한다.
 */
export function StartupCapabilityFields({ register, control, capabilities, setCapabilities, ip, setIp }: Props) {
  return (
    <>
      <SectionHeading title="역량" />
      <div className="grid gap-4 lg:grid-cols-2">
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
          />
        </PanelCard>

        <PanelCard title="지식재산·인증">
          <StartupIpFields ip={ip} setIp={setIp} />
        </PanelCard>
      </div>
    </>
  )
}
