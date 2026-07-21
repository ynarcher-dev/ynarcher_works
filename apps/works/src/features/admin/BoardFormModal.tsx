import { Button, Input, Modal } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { BOARD_ICON_OPTIONS, DEFAULT_BOARD_ICON } from '@/features/hub/boardIcons'
import type { BoardDef, BoardKind } from '@/features/hub/boardStore'

/** 생성 가능한 게시 종류. 공지사항은 게시판이 아니라 뷰이므로 선택지에 없다. */
const KIND_OPTIONS: { key: BoardKind; label: string; hint: string }[] = [
  { key: 'POST', label: '게시판', hint: '제목 클릭 시 상세페이지(본문·첨부·댓글)' },
  { key: 'ARCHIVE', label: '자료실', hint: '상세페이지 없이 목록에서 파일 즉시 다운로드' },
]

export interface BoardFormValue {
  label: string
  icon: string
  kind: BoardKind
}

/**
 * 게시판·자료실 생성/수정 모달.
 * `board`가 주어지면 수정 모드다. 수정에서는 구분(kind)을 바꾸지 않는다 —
 * 게시글의 소비 방식(상세페이지 vs 즉시 다운로드)이 통째로 달라져 기존 글이 깨지기 때문이다.
 */
export function BoardFormModal({
  open,
  board,
  onClose,
  onSubmit,
}: {
  open: boolean
  /** 수정 대상. 미지정 시 생성 모드. */
  board?: BoardDef
  onClose: () => void
  onSubmit: (value: BoardFormValue) => void
}) {
  const editing = Boolean(board)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(DEFAULT_BOARD_ICON)
  const [kind, setKind] = useState<BoardKind>('POST')

  // 모달을 열 때마다 대상 기준으로 초기화한다(직전 입력값이 남지 않도록).
  useEffect(() => {
    if (!open) return
    setName(board?.label ?? '')
    setIcon(board?.icon ?? DEFAULT_BOARD_ICON)
    setKind(board?.kind ?? 'POST')
  }, [open, board])

  const submit = () => {
    const label = name.trim()
    if (!label) return
    onSubmit({ label, icon, kind })
  }

  const kindLabel = kind === 'ARCHIVE' ? '자료실' : '게시판'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `${kindLabel} 수정` : '게시판·자료실 생성'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {editing ? '저장' : '생성'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-gray-600">구분</label>
          <div className="grid grid-cols-2 gap-2">
            {KIND_OPTIONS.map((opt) => {
              const selected = opt.key === kind
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={selected}
                  // 수정 모드에서는 구분을 잠근다(선택 상태만 보여준다).
                  disabled={editing}
                  onClick={() => setKind(opt.key)}
                  className={`flex flex-col gap-0.5 rounded-radius-md border px-3 py-2.5 text-left transition-colors duration-fast ${
                    selected
                      ? 'border-brand bg-brand/5'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  } ${editing ? 'cursor-not-allowed opacity-60 hover:border-gray-300 hover:bg-transparent' : ''}`}
                >
                  <span
                    className={`text-body font-semibold ${selected ? 'text-brand' : 'text-gray-800'}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-caption text-gray-600">{opt.hint}</span>
                </button>
              )
            })}
          </div>
          {editing && (
            <p className="text-caption text-gray-600">
              구분은 기존 게시글의 소비 방식이 달라지므로 수정할 수 없습니다.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-gray-600">{kindLabel}명</label>
          <Input
            autoFocus
            placeholder={kind === 'ARCHIVE' ? '예: 사내 규정 자료실' : '예: 규정·정책'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-gray-600">아이콘</label>
          <div className="grid grid-cols-7 gap-1.5">
            {BOARD_ICON_OPTIONS.map((opt) => {
              const selected = opt.key === icon
              const Icon = opt.Icon
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-label={opt.label}
                  aria-pressed={selected}
                  title={opt.label}
                  onClick={() => setIcon(opt.key)}
                  className={`grid aspect-square place-items-center rounded-radius-md border transition-colors duration-fast ${
                    selected
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              )
            })}
          </div>
        </div>

        <p className="text-caption text-gray-600">
          {editing
            ? '이름과 아이콘 변경은 OFFICE 사이드바와 페이지 제목에 즉시 반영됩니다.'
            : `생성 시 즉시 활성화되어 OFFICE 사이드바의 ${kindLabel} 그룹에 선택한 아이콘으로 노출됩니다. 공지사항은 게시판이 아니라 각 게시판의 전체 공지 글을 모아 보여주는 메뉴이므로 별도로 생성하지 않습니다.`}
        </p>
      </div>
    </Modal>
  )
}
