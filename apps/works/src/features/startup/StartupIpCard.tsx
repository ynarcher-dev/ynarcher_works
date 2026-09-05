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
 * 지식재산·인증 카드(역량 밴드). 읽기 전용 표시.
 *
 * 특허는 취득일이 있어도 **실적이 아니라 역량**이다 — 밴드를 가르는 기준은 날짜의 유무가 아니라
 * "같은 항목의 값을 기간마다 다시 재는가"이고, 특허·인증·과제 이력은 다시 재지 않고 쌓인다.
 * 국내 AC 심사에서 사실상 필수 항목이면서 전부 문서로 검증 가능한 사실이라, 정성 서술
 * (비즈니스·제품·팀)과 성격이 달라 카드를 따로 세운다.
 *
 * 출원·등록 건수는 저장하지 않고 목록에서 센다. 적어 두면 목록을 고쳤을 때 건수만 옛 값으로
 * 남아, 두 값이 어긋난 날 어느 쪽이 사실인지 답할 근거가 없다.
 */
export function StartupIpCard({ ip }: { ip: IpProfile }) {
  const { rights, certifications, govProjects } = ip
  const isEmpty = rights.length === 0 && certifications.length === 0 && govProjects.length === 0
  const applied = rights.filter((r) => r.status === '출원').length
  const registered = rights.filter((r) => r.status === '등록').length
  const countLine = [applied > 0 && `출원 ${applied}`, registered > 0 && `등록 ${registered}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <PanelCard title="지식재산·인증">
      {isEmpty ? (
        <EmptyLine noun="지식재산·인증" />
      ) : (
        <InfoRows
          items={rows([
            {
              label: '지식재산권',
              value: rights.length > 0 && (
                <div className="space-y-1">
                  {countLine && <p className="text-gray-500">{countLine}</p>}
                  <ul className="space-y-1">
                    {rights.map((r, i) => (
                      <li key={i}>
                        <span className="font-medium">{r.title || r.kind}</span>
                        <span className="text-gray-500">
                          {' · '}
                          {[r.kind, r.status, r.no, r.date].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            },
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
