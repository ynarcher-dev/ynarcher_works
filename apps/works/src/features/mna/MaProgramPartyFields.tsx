import { Button, Field, IconButton, cardText } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import { MaProgramPartyPicker } from '@/features/mna/MaProgramPartyField'
import {
  partyKindsOf,
  type MaProgramPartyKind,
  type MaProgramPartyPick,
} from '@/features/mna/programPartyLinks'

const LEDGER: Record<MaProgramPartyKind, string> = {
  SELL: 'M&A SELLER',
  BUY: 'M&A BUYER',
}

/**
 * 등록/편집 폼의 매물 연결 칸(원장 하나당 한 칸).
 *
 * 상세의 `MaProgramPartyPanel`과 **저장 시점이 다르다** — 저 패널은 고르는 즉시 RPC를 쏘지만
 * 여기서 고른 것은 폼이 저장될 때 함께 간다. 등록 시점에는 아직 프로젝트 id가 없어 쏠 곳이
 * 없고(그래서 종전에는 저장한 뒤 상세로 들어가 다시 골라야 했다), 편집에서도 취소를 누르면
 * 아무 일도 없어야 한다.
 *
 * 그래서 이 부품은 값을 들고 있지 않고 위(폼)가 소유한 상태를 그리기만 한다.
 */
export function MaProgramPartyFields({
  category,
  buyers,
  sellers,
  onChange,
}: {
  category: string | null | undefined
  buyers: MaProgramPartyPick[]
  sellers: MaProgramPartyPick[]
  onChange: (kind: MaProgramPartyKind, next: MaProgramPartyPick[]) => void
}) {
  const [picking, setPicking] = useState<MaProgramPartyKind | null>(null)
  const kinds = partyKindsOf(category)
  if (kinds.length === 0) return null

  return (
    <>
      {kinds.map((kind) => {
        const rows = kind === 'SELL' ? sellers : buyers
        return (
          <Field
            key={kind}
            label={LEDGER[kind]}
            hint={`${LEDGER[kind]} 원장에서 이 프로젝트와 연결할 기업을 고릅니다. 등록 후 상세 화면에서도 바꿀 수 있습니다.`}
            as="div"
          >
            <div className="rounded-radius-md border border-gray-200 p-2">
              {rows.length === 0 ? (
                <p className="px-1 py-1.5 text-body-sm text-gray-500">연결된 기업이 없습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-2 rounded-radius-md bg-gray-25 px-2 py-1"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className={cardText.label}>{row.name}</span>
                        {row.wish && (
                          <span className="ml-1.5 text-body-sm text-gray-500">{row.wish}</span>
                        )}
                      </span>
                      <IconButton
                        variant="ghost"
                        danger
                        label={`${row.name} 연결 해제`}
                        icon={<X className="size-4" aria-hidden />}
                        onClick={() => onChange(kind, rows.filter((r) => r.id !== row.id))}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1.5">
                <Button variant="outline" onClick={() => setPicking(kind)}>
                  기업 매핑
                </Button>
              </div>
            </div>
          </Field>
        )
      })}

      {picking && (
        <MaProgramPartyPicker
          kind={picking}
          selected={picking === 'SELL' ? sellers : buyers}
          onConfirm={(next) => onChange(picking, next)}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  )
}
