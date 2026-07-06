import { Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { maskEmail, maskPhone } from '@/lib/mask'
import { supabase } from '@/lib/supabase'
import { useSensitiveStore, type SensitiveField } from '@/features/admin/sensitiveStore'

interface Props {
  field: SensitiveField
  value: string | null | undefined
  /** 접근 로그용 컨텍스트. */
  resourceType?: string
  resourceId?: string
}

/**
 * 민감정보 표시값. ADMIN 정책이 '공개'면 원본을, '마스킹'이면 마스킹 + "보기"(사유 입력)로 열람한다.
 * 열람 시 접근 로그(access_logs)를 남긴다(베스트 에포트).
 */
export function SensitiveValue({ field, value, resourceType, resourceId }: Props) {
  const show = useSensitiveStore((s) => s.show[field])
  const userId = useAuthStore((s) => s.user?.id)
  const toast = useToast()
  const [revealed, setRevealed] = useState(false)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')

  if (!value) return <>-</>
  if (show || revealed) return <>{value}</>

  const masked = field === 'email' ? maskEmail(value) : maskPhone(value)

  const confirm = async () => {
    if (!reason.trim()) {
      toast.show('열람 사유를 입력하세요.', 'warning')
      return
    }
    // 접근 로그(베스트 에포트). 로깅 실패 시에도 데모에서는 열람을 진행한다.
    try {
      await supabase.from('access_logs').insert({
        user_id: userId ?? null,
        resource_type: resourceType ?? field,
        resource_id: resourceId ?? null,
        reason: reason.trim(),
      })
    } catch {
      /* 오프라인/로컬 등 로깅 실패 무시 */
    }
    setRevealed(true)
    setAsking(false)
    setReason('')
    toast.show('원본을 열람합니다. 접근 기록이 남았습니다.', 'success')
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span>{masked}</span>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="rounded-radius-sm border border-gray-300 px-1.5 py-0.5 text-caption text-gray-600 transition-colors hover:bg-gray-50"
      >
        보기
      </button>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="민감정보 열람 사유"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              취소
            </Button>
            <Button onClick={confirm}>열람</Button>
          </>
        }
      >
        <p className="mb-2 text-body text-gray-600">
          열람 사유를 입력하면 원본이 표시되며, 접근 기록이 남습니다.
        </p>
        <TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 매칭 진행을 위한 연락처 확인"
        />
      </Modal>
    </span>
  )
}
