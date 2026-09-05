import { Badge, InfoRows, PanelCard } from '@ynarcher/ui'
import { rows } from '@/features/startup/startupCardRows'
import { EmptyLine } from '@/features/startup/StartupCardEmpty'
import type { TechProfile } from '@/features/startup/startupProfile'

/**
 * 제품·기술 카드(역량 밴드). 읽기 전용 표시.
 *
 * `차별 역량`은 구 비즈니스 카드의 '경쟁 우위'가 뜻을 좁혀 옮겨 온 칸이다. 비교 대상(경쟁사)이
 * 화면에서 빠지면 "남보다 낫다"는 진술은 검증할 근거가 없어지므로, 남길 수 있는 것은
 * **우리만 가진 것**(독점 기술·독점 계약·데이터 자산·전환비용)뿐이다. 그 뜻이면 자기 자산의
 * 서술이라 외부 비교 없이 성립하고, 자리도 자산을 말하는 이 카드가 맞다.
 *
 * `개발 단계`와 `개발 내재화`를 배지로 세우는 이유는 라벨 없이 값만으로 읽히는 고정 선택지라서다
 * (기본 데이터 헤더의 단계·구분 칩과 같은 규칙). 톤은 중립 하나로 둔다 — 색은 상태에만 쓰고,
 * 여기 두 값은 좋고 나쁨이 아니라 사실의 분류다.
 */
export function StartupTechCard({ tech }: { tech: TechProfile }) {
  const isEmpty =
    !tech.product && !tech.devStage && !tech.coreTech && !tech.devInsourcing && !tech.differentiator

  return (
    <PanelCard title="제품·기술">
      {isEmpty ? (
        <EmptyLine noun="제품·기술" />
      ) : (
        <InfoRows
          items={rows([
            { label: '제품·서비스', value: tech.product, multiline: true },
            {
              label: '개발 단계',
              value: (tech.devStage || tech.devInsourcing) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {tech.devStage && <Badge tone="neutral">{tech.devStage}</Badge>}
                  {tech.devInsourcing && <Badge tone="neutral">{tech.devInsourcing}</Badge>}
                </div>
              ),
            },
            { label: '핵심 기술', value: tech.coreTech, multiline: true },
            { label: '차별 역량', value: tech.differentiator, multiline: true },
          ])}
        />
      )}
    </PanelCard>
  )
}
