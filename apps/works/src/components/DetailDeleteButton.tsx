import { Button, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { DeactivateReasonModal } from '@/features/networks/DeactivateReasonModal'

interface DetailDeleteButtonProps {
  /** 삭제 대상 이름(사유 모달 안내 문구용). */
  name?: string
  /**
   * 액션 표기(기본 '삭제'). 버튼·확인창·토스트 문구를 모두 이 말로 통일한다.
   * 임직원처럼 원장에서 '비활성화'로 부르는 대상만 바꾼다.
   */
  label?: string
  /**
   * true(기본)면 사유 입력 모달을, false면 확인창(confirm)을 띄운다.
   * NETWORKS·STARTUP처럼 사유를 기여 로그에 남기는 원장은 true, 사유 인프라가 없는 PROGRAM은 false.
   */
  withReason?: boolean
  /**
   * 소프트 삭제 실행. withReason이 true면 입력한 사유가 전달된다.
   * 실패 시 throw 하면 실패 토스트가 뜨고 화면에 머문다(성공 시에만 onDeleted 호출).
   */
  onDelete: (reason?: string) => Promise<void>
  /** 삭제 성공 후 실행(보통 목록으로 이동). */
  onDeleted?: () => void
}

/**
 * 상세 페이지 상단바의 '삭제' 액션 — 목록의 관리 컬럼에 있던 비활성화(소프트 삭제)를 상세로 옮긴 것이다.
 * 사유 모달/확인창·진행 상태·성공/실패 토스트를 스스로 소유하고, 실제 삭제와 이동만 상위가 주입한다.
 * 물리 삭제가 아니라 소프트 삭제(원장 트리거가 'deactivated' 기여 로그를 남김)이며, 표기만 '삭제'다.
 * 표기를 '비활성화'로 부르는 원장(임직원 등)은 `label`로 바꾼다 — 동작은 동일하다.
 */
export function DetailDeleteButton({
  name,
  label = '삭제',
  withReason = true,
  onDelete,
  onDeleted,
}: DetailDeleteButtonProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (reason?: string) => {
    setBusy(true)
    try {
      await onDelete(reason)
      toast.show(`${label}했습니다.`, 'success')
      setOpen(false)
      onDeleted?.()
    } catch {
      toast.show(`${label}에 실패했습니다. 권한을 확인하세요.`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="outline-danger"
        onClick={() => {
          if (withReason) {
            setOpen(true)
          } else if (
            typeof window !== 'undefined' &&
            window.confirm(`${name ? `'${name}'` : '이 항목'}을(를) ${label}하시겠습니까?`)
          ) {
            void run()
          }
        }}
      >
        {label}
      </Button>
      {withReason && open && (
        <DeactivateReasonModal
          open
          verb={label}
          name={name}
          busy={busy}
          onCancel={() => setOpen(false)}
          onConfirm={(reason) => void run(reason)}
        />
      )}
    </>
  )
}
