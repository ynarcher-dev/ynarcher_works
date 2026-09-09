import { Input, Select } from '@ynarcher/ui'
import { ItemRows, patchAt, removeAt, type ItemCol } from '@/components/ItemRows'
import { numOrUndef } from '@/components/FormRowFields'
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

/** 인증 한 줄. 인증명이 길이를 모르는 값이라 남는 폭을 가져간다. */
const CERT_COLS: ItemCol[] = [
  { label: '인증명' },
  { label: '발급 기관', kind: 'name' },
  { label: '시점', kind: 'date' },
]

/** 정부과제 한 줄. */
const GOV_COLS: ItemCol[] = [
  { label: '과제명' },
  { label: '참여 형태', kind: 'pick' },
  { label: '기간', kind: 'code' },
  { label: '과제비(원)', kind: 'num' },
]

export function StartupCertFields({ ip, setIp }: { ip: IpProfile; setIp: (v: IpProfile) => void }) {
  const setCerts = (certifications: Certification[]) => setIp({ ...ip, certifications })
  const setGov = (govProjects: GovProject[]) => setIp({ ...ip, govProjects })

  return (
    <div className="space-y-5">
      <ItemRows
        title="인증"
        cols={CERT_COLS}
        rows={ip.certifications}
        onRemove={(i) => setCerts(removeAt(ip.certifications, i))}
        onAdd={() => setCerts([...ip.certifications, { name: '', agency: '', date: '' }])}
        addLabel="인증 추가"
      >
        {(row, i) => {
          const patch = (p: Partial<Certification>) => setCerts(patchAt(ip.certifications, i, p))
          return (
            <>
              <Input
                placeholder="벤처기업 · 이노비즈 · 기업부설연구소 등"
                value={row.name ?? ''}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <Input value={row.agency ?? ''} onChange={(e) => patch({ agency: e.target.value })} />
              <Input type="month" value={row.date ?? ''} onChange={(e) => patch({ date: e.target.value })} />
            </>
          )
        }}
      </ItemRows>

      <ItemRows
        title="정부과제"
        cols={GOV_COLS}
        rows={ip.govProjects}
        onRemove={(i) => setGov(removeAt(ip.govProjects, i))}
        onAdd={() => setGov([...ip.govProjects, { name: '', role: '주관', period: '', amount: null }])}
        addLabel="정부과제 추가"
      >
        {(row, i) => {
          const patch = (p: Partial<GovProject>) => setGov(patchAt(ip.govProjects, i, p))
          return (
            <>
              <Input value={row.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
              <Select value={row.role ?? ''} onChange={(e) => patch({ role: e.target.value })}>
                <option value="">선택</option>
                {GOV_ROLE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="2024-03 ~ 2025-02"
                value={row.period ?? ''}
                onChange={(e) => patch({ period: e.target.value })}
              />
              <Input
                inputMode="numeric"
                className="text-right tabular-nums"
                value={row.amount == null ? '' : String(row.amount)}
                onChange={(e) => patch({ amount: numOrUndef(e.target.value) ?? null })}
              />
            </>
          )
        }}
      </ItemRows>
    </div>
  )
}
