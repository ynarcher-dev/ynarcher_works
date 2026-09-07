import { Button, Checkbox, Input, Modal, Spinner } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  useMaProgramPartyPool,
  type MaProgramPartyKind,
  type MaProgramPartyPick,
} from '@/features/mna/programPartyLinks'

export function MaProgramPartyPicker({
  kind,
  selected,
  onConfirm,
  onClose,
}: {
  kind: MaProgramPartyKind
  selected: MaProgramPartyPick[]
  onConfirm: (next: MaProgramPartyPick[]) => void
  onClose: () => void
}) {
  const [keyword, setKeyword] = useState('')
  const [draft, setDraft] = useState<MaProgramPartyPick[]>(selected)
  const { data, isLoading } = useMaProgramPartyPool(kind, true)
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return (data ?? [])
      .filter((row) => !kw || row.name.toLowerCase().includes(kw) || (row.wish ?? '').toLowerCase().includes(kw))
      .slice(0, 50)
  }, [data, keyword])
  const selectedIds = new Set(draft.map((row) => row.id))

  return (
    <Modal
      open
      onClose={onClose}
      title={`${kind === 'SELL' ? 'M&A SELLER' : 'M&A BUYER'} 매물 선택`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={() => { onConfirm(draft); onClose() }}>선택 완료 ({draft.length})</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="기업명·희망사항 검색"
          autoFocus
        />
        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-caption text-gray-500">검색 결과가 없습니다.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {rows.map((row) => {
              const checked = selectedIds.has(row.id)
              return (
                <li key={row.id}>
                  <Checkbox
                    boxed
                    checked={checked}
                    wrapperClassName="flex w-full items-start"
                    onChange={() =>
                      setDraft(checked ? draft.filter((v) => v.id !== row.id) : [...draft, row])
                    }
                    label={
                      <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-gray-900">{row.name}</span>
                      {row.wish && <span className="block truncate text-caption text-gray-500">{row.wish}</span>}
                      </span>
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-caption text-gray-500">최대 50건까지 보여줍니다. 찾는 매물이 없으면 검색어로 좁히세요.</p>
      </div>
    </Modal>
  )
}
