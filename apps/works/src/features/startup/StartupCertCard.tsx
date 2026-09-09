import { InfoRows, PanelCard } from '@ynarcher/ui'
import { rows } from '@/features/startup/startupCardRows'
import { EmptyLine } from '@/features/startup/StartupCardEmpty'
import type { IpProfile } from '@/features/startup/startupProfile'

/** 과제비 표기(백만원 단위 반올림). 값 없으면 빈 문자열. */
function amountText(v?: number | null): string {
  if (v == null || Number.isNaN(Number(v))) return ''
  return `${Math.round(Number(v) / 1_000_000).toLocaleString()}백만원`
}

/**
 * 인증·정부과제 카드(역량 밴드). 읽기 전용 표시.
 *
 * 지식재산에서 갈려 나왔다(2026-09-09) — 여기 담기는 것은 **밖에서 받은 자격**이라 근거 문서가
 * 다르고(사업계획서 부록·기업 현황표), 국내 AC 심사에서 이 둘은 함께 확인된다.
 *
 * 인증과 정부과제가 한 카드에 남는 이유도 같다 — 둘 다 기관이 준 것이고 한 문서에서 나란히
 * 읽힌다. 건수는 저장하지 않고 목록에서 센다.
 */
export function StartupCertCard({ ip }: { ip: IpProfile }) {
  const { certifications, govProjects } = ip

  return (
    <PanelCard title="인증·정부과제">
      {certifications.length === 0 && govProjects.length === 0 ? (
        <EmptyLine noun="인증·정부과제" />
      ) : (
        <InfoRows
          items={rows([
            {
              label: '인증',
              value: certifications.length > 0 && (
                <ul className="space-y-1">
                  {certifications.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.name}</span>
                      {(c.agency || c.date) && (
                        <span className="text-gray-500">
                          {' · '}
                          {[c.agency, c.date].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              label: '정부과제',
              value: govProjects.length > 0 && (
                <ul className="space-y-1">
                  {govProjects.map((g, i) => (
                    <li key={i}>
                      <span className="font-medium">{g.name}</span>
                      <span className="text-gray-500">
                        {' · '}
                        {[g.role, g.period, amountText(g.amount)].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
            },
          ])}
        />
      )}
    </PanelCard>
  )
}
