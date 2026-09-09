import { Button, Input, Select } from '@ynarcher/ui'
import { Cell, RowActions, numOrUndef } from '@/components/FormRowFields'
import { StartupListGroup } from '@/features/startup/StartupListGroup'
import {
  GOV_ROLE_OPTIONS,
  type Certification,
  type GovProject,
  type IpProfile,
} from '@/features/startup/startupProfile'

/**
 * 통합 수정 폼의 '인증·정부과제' 입력 섹션.
 *
 * 지식재산에서 갈려 나왔다(2026-09-09) — 그쪽은 우리가 만든 자산이고 여기는 **밖에서 받은
 * 자격**이다. 둘을 한 카드에 두던 시절에는 AI 작성의 체크 한 칸이 성격이 다른 세 목록을 함께
 * 바꿨다.
 *
 * 인증과 정부과제는 서로 갈리지 않고 한 카드에 남는다. 둘 다 **기관이 준 것**이고 한 문서
 * (사업계획서 부록·기업 현황표)에서 나란히 읽히므로, 채울 때도 한자리에서 옮겨 적게 된다.
 */
export function StartupCertFields({ ip, setIp }: { ip: IpProfile; setIp: (v: IpProfile) => void }) {
  return (
    <div className="space-y-5">
      <StartupListGroup<Certification>
        title="인증"
        rows={ip.certifications}
        setRows={(certifications) => setIp({ ...ip, certifications })}
        empty={{ name: '', agency: '', date: '' }}
        addLabel="인증 추가"
      >
        {(row, patch, remove) => (
          <>
            <Cell label="인증명" wide>
              <Input
                placeholder="벤처기업 · 이노비즈 · 기업부설연구소 등"
                value={row.name ?? ''}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Cell>
            <Cell label="발급 기관">
              <Input value={row.agency ?? ''} onChange={(e) => patch({ agency: e.target.value })} />
            </Cell>
            <Cell label="시점">
              <Input type="month" value={row.date ?? ''} onChange={(e) => patch({ date: e.target.value })} />
            </Cell>
            <RowActions>
              <Button type="button" variant="secondary" onClick={remove}>
                삭제
              </Button>
            </RowActions>
          </>
        )}
      </StartupListGroup>

      <StartupListGroup<GovProject>
        title="정부과제"
        rows={ip.govProjects}
        setRows={(govProjects) => setIp({ ...ip, govProjects })}
        empty={{ name: '', role: '주관', period: '', amount: null }}
        addLabel="정부과제 추가"
      >
        {(row, patch, remove) => (
          <>
            <Cell label="과제명" wide>
              <Input value={row.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
            </Cell>
            <Cell label="참여 형태">
              <Select value={row.role ?? ''} onChange={(e) => patch({ role: e.target.value })}>
                <option value="">선택</option>
                {GOV_ROLE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Cell>
            <Cell label="기간">
              <Input
                placeholder="2024-03 ~ 2025-02"
                value={row.period ?? ''}
                onChange={(e) => patch({ period: e.target.value })}
              />
            </Cell>
            <Cell label="과제비(원)" wide>
              <Input
                inputMode="numeric"
                className="text-right tabular-nums"
                value={row.amount == null ? '' : String(row.amount)}
                onChange={(e) => patch({ amount: numOrUndef(e.target.value) ?? null })}
              />
            </Cell>
            <RowActions>
              <Button type="button" variant="secondary" onClick={remove}>
                삭제
              </Button>
            </RowActions>
          </>
        )}
      </StartupListGroup>
    </div>
  )
}
