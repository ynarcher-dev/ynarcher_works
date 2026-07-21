import { Button, Input, Modal } from '@ynarcher/ui'
import { useCallback, useState } from 'react'

/** 사유 최대 길이. 변동 이력의 한 줄에 잘리지 않고 들어가는 길이(비활성화 사유와 동일 규격). */
const MAX = 30

/**
 * 수정 사유 입력 프롬프트(공용 훅).
 *
 * 수정 저장은 폼마다 흐름이 다르지만(구분 이관 분기·담당자 재구성 등), 사유를 받는 부분은
 * 전부 같다. 그래서 모달을 폼마다 손으로 배선하는 대신 Promise를 돌려주는 훅으로 둔다 —
 * 저장 핸들러에 `const reason = await askReason(); if (!reason) return` 한 줄만 들어간다.
 *
 * 사유는 원장 컬럼이 아니라 기여 로그의 note로 남으므로, 저장은 사유를 트랜잭션 컨텍스트에
 * 실어 주는 update_entity RPC를 경유해야 한다(20260721200000). 비활성화 사유
 * (DeactivateReasonModal)와 규격은 같지만 문구·버튼 톤이 달라 컴포넌트는 나눠 둔다.
 */
export function useEditReasonPrompt() {
  const [resolver, setResolver] = useState<((v: string | null) => void) | null>(null)
  const [reason, setReason] = useState('')

  /** 모달을 열고 입력을 기다린다. 확인이면 사유(공백 제거), 취소면 null. */
  const askReason = useCallback(() => {
    setReason('')
    // setState에 함수를 넣으면 업데이터로 해석되므로 한 겹 감싼다.
    return new Promise<string | null>((resolve) => setResolver(() => resolve))
  }, [])

  const settle = (value: string | null) => {
    resolver?.(value)
    setResolver(null)
  }

  const trimmed = reason.trim()
  const reasonModal = (
    <Modal
      open={resolver !== null}
      onClose={() => settle(null)}
      title="수정 사유"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => settle(null)}>
            취소
          </Button>
          <Button onClick={() => trimmed && settle(trimmed)} disabled={!trimmed}>
            수정 완료
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-caption text-gray-600">
          무엇을 왜 바꿨는지 30자 이내로 입력하세요. 변동 이력에 그대로 기록됩니다.
        </p>
        <Input
          autoFocus
          value={reason}
          maxLength={MAX}
          placeholder="예: 연락처 최신화, 소속 변경"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed) settle(trimmed)
          }}
        />
        <div className="text-right text-caption text-gray-600">
          {reason.length}/{MAX}
        </div>
      </div>
    </Modal>
  )

  return { askReason, reasonModal }
}
