import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button, Checkbox, IconButton, Input, cardText, cn } from '@ynarcher/ui'
import type { QuickMemoItem } from './quickMemoStore'

/**
 * 체크리스트 한 줄 — 남은 칸과 완료함이 **같은 줄 모양**을 쓴다.
 *
 * 완료함을 읽기 전용으로 만들지 않는 이유는, 잘못 체크한 항목을 되돌리는 자리가 곧 이 줄이기
 * 때문이다. 모아 둔 곳에서 체크만 풀면 그 줄은 다시 위쪽 남은 목록으로 돌아간다.
 */
function ChecklistRow({
  item,
  onChange,
  onRemove,
}: {
  item: QuickMemoItem
  onChange: (patch: Partial<QuickMemoItem>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={item.completed}
        aria-label={`${item.content || '빈 항목'} 완료`}
        onChange={(event) => onChange({ completed: event.target.checked })}
      />
      <Input
        value={item.content}
        placeholder="할 일을 입력하세요"
        onChange={(event) => onChange({ content: event.target.value })}
        className={cn(item.completed && 'text-gray-400 line-through')}
      />
      <IconButton
        variant="ghost"
        label="항목 삭제"
        onClick={onRemove}
        icon={<Trash2 aria-hidden className="size-4" strokeWidth={1.8} />}
      />
    </div>
  )
}

/**
 * 체크리스트 편집기 — 남은 항목만 위에 세우고, **완료한 항목은 구분선 아래 완료함**에 모은다
 * (2026-08-26).
 *
 * 그전에는 체크한 줄이 원래 자리에 취소선만 그은 채 남아, 목록이 길어질수록 "이제 뭘 해야
 * 하는가"가 끝난 일 사이에 흩어졌다. 체크하는 순간 줄이 아래로 내려가므로 위쪽에는 항상 남은
 * 일만 선다.
 *
 * 완료함은 접힌 채로 열리고 건수만 보인다 — 끝난 일은 세어 보는 대상이지 읽는 대상이 아니다.
 * 완료가 하나도 없으면 구분선도 버튼도 세우지 않는다(가를 것이 없는 자리의 선은 빈 칸으로만
 * 읽힌다).
 *
 * 항목 순서는 원본 배열이 그대로 쥔다 — 화면에서 두 벌로 갈라 보일 뿐 저장되는 순서는 바뀌지
 * 않으므로, 체크를 풀면 항목이 원래 있던 자리로 돌아간다.
 */
export function ChecklistEditor({
  items,
  onChange,
}: {
  items: QuickMemoItem[]
  onChange: (items: QuickMemoItem[]) => void
}) {
  const [doneOpen, setDoneOpen] = useState(false)

  const pending = items.filter((item) => !item.completed)
  const done = items.filter((item) => item.completed)

  const patchItem = (id: string, patch: Partial<QuickMemoItem>) =>
    onChange(items.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  const removeItem = (id: string) => onChange(items.filter((row) => row.id !== id))

  return (
    <div className="mt-3 space-y-2">
      {pending.map((item) => (
        <ChecklistRow key={item.id} item={item}
          onChange={(patch) => patchItem(item.id, patch)}
          onRemove={() => removeItem(item.id)} />
      ))}
      <Button variant="ghost" className="w-full justify-start text-gray-500"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), content: '', completed: false }])}>
        <Plus aria-hidden className="size-4" /> 항목 추가
      </Button>

      {done.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <Button variant="ghost" className="w-full justify-start text-gray-500"
            aria-expanded={doneOpen} onClick={() => setDoneOpen((open) => !open)}>
            <ChevronDown aria-hidden
              className={cn('size-4 transition-transform', !doneOpen && '-rotate-90')} />
            완료 <span className={cardText.meta}>{done.length}</span>
          </Button>
          {doneOpen && (
            <div className="mt-2 space-y-2">
              {done.map((item) => (
                <ChecklistRow key={item.id} item={item}
                  onChange={(patch) => patchItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
