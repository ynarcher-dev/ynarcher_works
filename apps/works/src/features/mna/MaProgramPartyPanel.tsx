import {
  BoardEmptyRow,
  BoardItemCard,
  Button,
  Card,
  IconButton,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MaProgramPartyPicker } from '@/features/mna/MaProgramPartyField'
import {
  useMaProgramPartyLinks,
  useSetMaProgramPartyLinks,
  type MaProgramPartyKind,
  type MaProgramPartyPick,
} from '@/features/mna/programPartyLinks'

/** M&A 프로젝트 상세의 SELLER·BUYER 매핑 탭. 원장별 연결과 해제를 이 자리에서 끝낸다. */
export function MaProgramPartyPanel({
  programId,
  category,
  kind,
}: {
  programId: string
  category: string | null
  kind: MaProgramPartyKind
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [picking, setPicking] = useState(false)
  const { data: links, isLoading } = useMaProgramPartyLinks(programId)
  const save = useSetMaProgramPartyLinks()
  const selected = (links ?? []).filter((link) => link.kind === kind)
  const ledger = kind === 'SELL' ? 'M&A SELLER' : 'M&A BUYER'

  const saveKind = async (next: MaProgramPartyPick[]) => {
    const otherKind: MaProgramPartyKind = kind === 'SELL' ? 'BUY' : 'SELL'
    const other = (links ?? []).filter((link) => link.kind === otherKind)
    const buyers = kind === 'BUY' ? next : other
    const sellers = kind === 'SELL' ? next : other
    try {
      await save.mutateAsync({
        programId,
        buyerIds:
          category === 'BUY' || category === 'SELL_BUY' ? buyers.map((row) => row.id) : [],
        sellerIds:
          category === 'SELL' || category === 'SELL_BUY' ? sellers.map((row) => row.id) : [],
      })
      toast.show(`${ledger} 매핑을 저장했습니다.`, 'success')
    } catch {
      toast.show('매핑 저장에 실패했습니다. 권한과 사업구분을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title={ledger}
      count={selected.length}
      help={`${ledger} 원장에서 이 프로젝트와 연결할 기업을 고릅니다.`}
      actions={<Button onClick={() => setPicking(true)}>기업 매핑</Button>}
    >
      {isLoading ? (
        <Spinner />
      ) : selected.length === 0 ? (
        <BoardEmptyRow>매핑된 기업이 없습니다.</BoardEmptyRow>
      ) : (
        <ul className="space-y-2">
          {selected.map((party) => (
            <li key={party.id}>
              <BoardItemCard
                title={party.name}
                description={party.wish ?? undefined}
                onClick={() =>
                  navigate(`${kind === 'SELL' ? '/sellers' : '/buyers'}/${party.id}`)
                }
                actions={
                  <IconButton
                    icon={<X />}
                    label={`${party.name} 연결 해제`}
                    onClick={() => void saveKind(selected.filter((row) => row.id !== party.id))}
                    disabled={save.isPending}
                    danger
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
      {picking && (
        <MaProgramPartyPicker
          kind={kind}
          selected={selected}
          onConfirm={(next) => void saveKind(next)}
          onClose={() => setPicking(false)}
        />
      )}
    </Card>
  )
}
