import { Input, Select } from '@ynarcher/ui'
import { ItemRows, patchAt, removeAt, type ItemCol } from '@/components/ItemRows'
import {
  IP_KIND_OPTIONS,
  IP_STATUS_OPTIONS,
  type IpProfile,
  type IpRight,
} from '@/features/startup/startupProfile'

/**
 * 통합 수정 폼의 '지식재산' 입력 섹션 — 권리 목록 하나다.
 *
 * **인증·정부과제와 갈렸다**(2026-09-09 사용자 지정). 종전에는 목록 셋이 한 카드에 있어서,
 * AI 작성에서 체크 한 칸이 셋을 함께 바꾸고 조회에서도 셋이 한 상자에 담겼다. 지식재산은
 * **우리가 만든 자산**이고 인증·정부과제는 **밖에서 받은 자격**이라 근거 문서가 다르다
 * (등록원부·공보 / 사업계획서 부록). 근거가 다르면 채우는 자리도 갈리는 편이 맞다.
 *
 * 출원·등록 건수를 받는 칸은 없다 — 목록이 이미 아는 값이라 따로 받으면 목록을 고쳤을 때
 * 건수만 옛 값으로 남는다. 조회 화면의 카드가 목록에서 센다.
 *
 * 종류(특허·상표·디자인·SW저작권)와 상태(출원·등록)를 한 목록의 두 값으로 둔 이유는, 세 목록으로
 * 나누면 같은 형태의 표가 셋 서면서 어느 목록에 넣어야 하는지를 매번 판단하게 되기 때문이다.
 */
const IP_COLS: ItemCol[] = [
  { label: '종류', kind: 'pick' },
  { label: '상태', kind: 'pick' },
  { label: '명칭' },
  { label: '번호', kind: 'code' },
  { label: '시점', kind: 'date' },
]

export function StartupIpFields({ ip, setIp }: { ip: IpProfile; setIp: (v: IpProfile) => void }) {
  const setRights = (rights: IpRight[]) => setIp({ ...ip, rights })

  return (
    <ItemRows
      title="지식재산권"
      cols={IP_COLS}
      rows={ip.rights}
      onRemove={(i) => setRights(removeAt(ip.rights, i))}
      onAdd={() => setRights([...ip.rights, { kind: '특허', title: '', no: '', status: '출원', date: '' }])}
      addLabel="지식재산권 추가"
    >
      {(row, i) => {
        const patch = (p: Partial<IpRight>) => setRights(patchAt(ip.rights, i, p))
        return (
          <>
            <Select value={row.kind ?? ''} onChange={(e) => patch({ kind: e.target.value })}>
              {IP_KIND_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
            <Select value={row.status ?? ''} onChange={(e) => patch({ status: e.target.value })}>
              <option value="">선택</option>
              {IP_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
            <Input value={row.title ?? ''} onChange={(e) => patch({ title: e.target.value })} />
            <Input value={row.no ?? ''} onChange={(e) => patch({ no: e.target.value })} />
            <Input type="month" value={row.date ?? ''} onChange={(e) => patch({ date: e.target.value })} />
          </>
        )
      }}
    </ItemRows>
  )
}
