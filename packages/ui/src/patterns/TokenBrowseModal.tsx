import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { TagChip } from '../components/TagChip'

export interface TokenBrowseModalProps<T> {
  open: boolean
  onClose: () => void
  /** 모달 제목 — 무엇의 전체 목록인지("전문 영역 전체 목록"). */
  title: string
  /** 후보 전체. 검색으로 좁히지 않은 원래 목록이 이 모달의 존재 이유다. */
  options: T[]
  selected: T[]
  getKey: (item: T) => string
  getLabel: (item: T) => string
  /** 켜기/끄기 한 동작. 이미 고른 것을 다시 누르면 빠진다. */
  onToggle: (item: T) => void
  /** 최대 선택 수(넘으면 안 고른 칩이 잠긴다). */
  max?: number
  /** 후보가 하나도 없을 때의 안내 — 어디서 만드는지까지 말한다. */
  emptyText?: string
}

/**
 * 토큰 선택기의 '전체 목록' 모달 — 돋보기로 연다.
 *
 * 입력 칸의 자동완성은 **이미 아는 것을 빨리 찾는** 수단이라, 무엇이 있는지 모르는 사람 앞에서는
 * 빈 칸일 뿐이다. 그래서 목록을 통째로 펴는 자리를 따로 둔다. 드롭다운이 아니라 모달인 것은 이
 * 목록이 훑어보는 대상이기 때문이다 — 드롭다운은 스크롤 안에 갇혀 몇 줄씩만 보이고, 그 상태로는
 * '전체'를 보여준다는 말이 무색해진다.
 *
 * 고르면 즉시 반영하고 확정 버튼을 두지 않는다. 뒤에 있는 입력 칸이 결과를 그대로 비추므로
 * 임시 상태를 따로 들 이유가 없고, 임시 상태를 두면 '적용'을 누르지 않고 닫은 선택이 조용히
 * 사라진다. 그래서 푸터의 버튼은 확정이 아니라 닫기다.
 *
 * 검색 칸을 안에 두지 않는다 — 검색은 이 모달을 연 그 입력 칸이 이미 갖고 있고, 같은 일을 하는
 * 칸이 둘이면 어느 쪽 결과를 보고 있는지가 흐려진다.
 */
export function TokenBrowseModal<T>({
  open,
  onClose,
  title,
  options,
  selected,
  getKey,
  getLabel,
  onToggle,
  max,
  emptyText,
}: TokenBrowseModalProps<T>) {
  const selectedKeys = new Set(selected.map(getKey))
  const atMax = max != null && selectedKeys.size >= max
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          {/* 상한이 있으면 남은 개수를 푸터가 답한다 — 칩이 잠긴 이유를 눌러 보고 알게 두지 않는다. */}
          {max != null && (
            <span className="mr-auto self-center text-caption text-gray-600">
              {selectedKeys.size} / {max} 선택
            </span>
          )}
          <Button variant="primary" onClick={onClose}>
            닫기
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p className="text-body text-gray-600">{emptyText ?? '선택할 수 있는 항목이 없습니다.'}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = selectedKeys.has(getKey(o))
            return (
              <TagChip
                key={getKey(o)}
                selected={on}
                disabled={!on && atMax}
                onClick={() => onToggle(o)}
              >
                {getLabel(o)}
              </TagChip>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
