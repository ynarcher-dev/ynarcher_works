import { Button, Input, Select, cardText } from '@ynarcher/ui'
import { Cell, RowActions, RowBox } from '@/features/startup/StartupFieldLabel'
import {
  GOV_ROLE_OPTIONS,
  IP_KIND_OPTIONS,
  IP_STATUS_OPTIONS,
  type Certification,
  type GovProject,
  type IpProfile,
  type IpRight,
} from '@/features/startup/startupProfile'

/** 빈 문자열 → undefined, 그 외 숫자로 파싱(콤마 허용). */
function numOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? undefined : n
}

/** 목록 한 벌(소제목 + 항목들 + 추가 버튼)을 감싸는 공통 틀. */
function Group<T>({
  title,
  rows,
  setRows,
  empty,
  addLabel,
  children,
}: {
  title: string
  rows: T[]
  setRows: (rows: T[]) => void
  empty: T
  addLabel: string
  children: (row: T, patch: (p: Partial<T>) => void, remove: () => void) => React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <h3 className={cardText.subhead}>{title}</h3>
      {rows.map((row, i) => (
        <RowBox key={i}>
          {children(
            row,
            (p) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r))),
            () => setRows(rows.filter((_, idx) => idx !== i)),
          )}
        </RowBox>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { ...empty }])}>
        {addLabel}
      </Button>
    </div>
  )
}

/**
 * 통합 수정 폼의 '지식재산·인증' 입력 섹션.
 *
 * 출원·등록 건수를 받는 칸은 없다 — 목록이 이미 아는 값이라 따로 받으면 목록을 고쳤을 때
 * 건수만 옛 값으로 남는다. 조회 화면의 카드가 목록에서 센다.
 *
 * 종류(특허·상표·디자인·SW저작권)와 상태(출원·등록)를 한 목록의 두 값으로 둔 이유는, 세 목록으로
 * 나누면 같은 형태의 표가 셋 서면서 어느 목록에 넣어야 하는지를 매번 판단하게 되기 때문이다.
 */
export function StartupIpFields({ ip, setIp }: { ip: IpProfile; setIp: (v: IpProfile) => void }) {
  return (
    <div className="space-y-5">
      <Group<IpRight>
        title="지식재산권"
        rows={ip.rights}
        setRows={(rights) => setIp({ ...ip, rights })}
        empty={{ kind: '특허', title: '', no: '', status: '출원', date: '' }}
        addLabel="지식재산권 추가"
      >
        {(row, patch, remove) => (
          <>
            <Cell label="종류">
              <Select value={row.kind ?? ''} onChange={(e) => patch({ kind: e.target.value })}>
                {IP_KIND_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Cell>
            <Cell label="상태">
              <Select value={row.status ?? ''} onChange={(e) => patch({ status: e.target.value })}>
                <option value="">선택</option>
                {IP_STATUS_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Cell>
            <Cell label="명칭" wide>
              <Input value={row.title ?? ''} onChange={(e) => patch({ title: e.target.value })} />
            </Cell>
            <Cell label="번호">
              <Input value={row.no ?? ''} onChange={(e) => patch({ no: e.target.value })} />
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
      </Group>

      <Group<Certification>
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
      </Group>

      <Group<GovProject>
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
      </Group>
    </div>
  )
}
