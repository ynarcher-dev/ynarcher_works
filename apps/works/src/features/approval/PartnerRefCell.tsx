import { Badge, Button, Input, Modal, cn, tableText } from '@ynarcher/ui'
import { useState } from 'react'
import { bankLabel } from '@/features/management/partners/config'
import {
  usePartnerOption,
  usePartnerOptions,
} from '@/features/management/partners/partnerDirectoryApi'
import { PartnerQuickAddModal } from '@/features/management/partners/PartnerQuickAddModal'

interface Props {
  value: string
  onChange: (next: string) => void
}

/**
 * 송금 요청 한 줄의 '거래처' 칸 — **원장에서 고르기만 한다.**
 *
 * 이름을 글자로 적는 칸을 두지 않는 이유는 지급 담당자가 계좌를 확인할 곳이 없어지기
 * 때문이다. 원장에 없으면 그 자리에서 넣되 **원장에 먼저 들어간 뒤** 이 줄이 그 행을 가리킨다.
 *
 * 은행·계좌·예금주는 이 칸이 아니라 **거래처 행이 답한다**(요청서에 옮겨 적지 않는다).
 * 옮겨 적으면 요청서의 계좌와 원장의 계좌가 달라지는 날이 오고, 그때 어디로 보내야 하는지
 * 아무도 답하지 못한다. 계좌가 바뀌었으면 새 거래처를 만드는 것이 맞다(거래처 하나 = 계좌 하나).
 */
export function PartnerRefCell({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [keyword, setKeyword] = useState('')
  const { data: picked } = usePartnerOption(value || null)
  const { data: options } = usePartnerOptions(keyword)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'w-full rounded-radius-sm border border-gray-300 px-2 py-1 text-left',
          tableText.body,
          'hover:border-gray-400',
        )}
      >
        {picked ? (
          <span className="flex items-center gap-1.5">
            <span className="truncate">{picked.name}</span>
            {!picked.verifiedAt && <Badge tone="warning">확인 전</Badge>}
          </span>
        ) : value ? (
          <span className="text-gray-500">거래처 (열람 권한 없음)</span>
        ) : (
          <span className="text-gray-400">거래처 선택</span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="거래처 선택" size="lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder="거래처명·코드·예금주로 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button variant="outline" onClick={() => setAdding(true)}>
              새 거래처 등록
            </Button>
          </div>

          <div className="overflow-x-auto rounded-radius-md border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-25">
                  <th className={cn('w-28 px-3 py-1.5 text-left', tableText.head)}>코드</th>
                  <th className={cn('px-3 py-1.5 text-left', tableText.head)}>거래처명</th>
                  <th className={cn('w-32 px-3 py-1.5 text-left', tableText.head)}>은행</th>
                  <th className={cn('w-40 px-3 py-1.5 text-left', tableText.head)}>계좌</th>
                  <th className={cn('w-28 px-3 py-1.5 text-left', tableText.head)}>예금주</th>
                  <th className="w-20 px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {(options ?? []).map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 last:border-b-0">
                    <td className={cn('px-3 py-1.5 tabular-nums', tableText.body)}>{o.code}</td>
                    <td className={cn('px-3 py-1.5', tableText.body)}>
                      <span className="flex items-center gap-1.5">
                        {o.name}
                        {!o.verifiedAt && <Badge tone="warning">확인 전</Badge>}
                        {/* 거래가 끝난 거래처도 목록에 남는다(과거 요청을 설명해야 한다).
                            새로 고르는 자리에서는 그 사실이 보여야 한다. */}
                        {!o.isActive && <Badge tone="neutral">거래 중단</Badge>}
                      </span>
                    </td>
                    <td className={cn('px-3 py-1.5', tableText.body)}>
                      {o.bankCode ? bankLabel(o.bankCode) : '-'}
                    </td>
                    <td className={cn('px-3 py-1.5 tabular-nums', tableText.body)}>
                      {o.accountNoLast4 ? `****${o.accountNoLast4}` : '-'}
                    </td>
                    <td className={cn('px-3 py-1.5', tableText.body)}>{o.accountHolder || '-'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        density="table"
                        variant={o.id === value ? 'primary' : 'outline'}
                        onClick={() => {
                          onChange(o.id)
                          setOpen(false)
                        }}
                      >
                        {o.id === value ? '선택됨' : '선택'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {(options ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className={cn('px-3 py-6 text-center', tableText.empty)}>
                      찾는 거래처가 없습니다. [새 거래처 등록]으로 원장에 넣을 수 있습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {value && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                density="table"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                선택 해제
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <PartnerQuickAddModal
        open={adding}
        onClose={() => setAdding(false)}
        initialName={keyword}
        onCreated={(id) => {
          onChange(id)
          setOpen(false)
        }}
      />
    </>
  )
}
