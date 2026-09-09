import { InfoRows, PanelCard } from '@ynarcher/ui'
import { rows } from '@/features/startup/startupCardRows'
import { EmptyLine } from '@/features/startup/StartupCardEmpty'
import type { IpProfile } from '@/features/startup/startupProfile'

/**
 * 지식재산 카드(역량 밴드). 읽기 전용 표시.
 *
 * 특허는 취득일이 있어도 **실적이 아니라 역량**이다 — 밴드를 가르는 기준은 날짜의 유무가 아니라
 * "같은 항목의 값을 기간마다 다시 재는가"이고, 특허 이력은 다시 재지 않고 쌓인다.
 *
 * **인증·정부과제와 갈렸다**(2026-09-09 사용자 지정). 이 카드가 담는 것은 **우리가 만든 자산**
 * 이고 저쪽은 밖에서 받은 자격이라, 근거 문서도 채우는 자리도 다르다.
 *
 * 출원·등록 건수는 저장하지 않고 목록에서 센다. 적어 두면 목록을 고쳤을 때 건수만 옛 값으로
 * 남아, 두 값이 어긋난 날 어느 쪽이 사실인지 답할 근거가 없다.
 */
export function StartupIpCard({ ip }: { ip: IpProfile }) {
  const { rights } = ip
  const applied = rights.filter((r) => r.status === '출원').length
  const registered = rights.filter((r) => r.status === '등록').length
  const countLine = [applied > 0 && `출원 ${applied}`, registered > 0 && `등록 ${registered}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <PanelCard title="지식재산">
      {rights.length === 0 ? (
        <EmptyLine noun="지식재산권" />
      ) : (
        <InfoRows
          items={rows([
            {
              label: '지식재산권',
              value: (
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
          ])}
        />
      )}
    </PanelCard>
  )
}
