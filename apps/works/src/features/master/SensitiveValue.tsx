import { Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { maskBy } from '@/lib/mask'
import { supabase } from '@/lib/supabase'
import { useMaskPolicy, type SensitiveField } from '@/features/admin/sensitiveStore'

interface Props {
  field: SensitiveField
  /** 민감정보 정책 콘텐츠 키(어느 메뉴의 상세인지). 카탈로그: features/admin/sensitiveContents.ts */
  contentKey: string
  value: string | null | undefined
  /** 접근 로그용 컨텍스트. */
  resourceType?: string
  resourceId?: string
}

/**
 * 민감정보 표시값. 콘텐츠별 ADMIN 정책이 '공개'면 원본을, '마스킹'이면 마스킹 + "보기"(사유 입력)로 열람한다.
 * 열람 로그는 서버 RPC(log_sensitive_access)가 강제하며, 로그 적재에 실패하면
 * 원본을 표시하지 않는다(사유 검증도 서버에서 수행).
 */
export function SensitiveValue({ field, contentKey, value, resourceType, resourceId }: Props) {
  const policy = useMaskPolicy(contentKey)
  const toast = useToast()
  const [revealed, setRevealed] = useState(false)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')

  if (!value) return <>-</>
  if (!policy[field] || revealed) return <>{value}</>

  const masked = maskBy(field, value)

  const confirm = async () => {
    if (!reason.trim()) {
      toast.show('열람 사유를 입력하세요.', 'warning')
      return
    }
    // 서버 강제 접근 로그: RPC가 인증·사유 검증·access_logs 적재까지 수행한다.
    const { error } = await supabase.rpc('log_sensitive_access', {
      p_resource_type: resourceType ?? field,
      p_resource_id: resourceId ?? null,
      p_reason: reason.trim(),
    })
    if (error) {
      toast.show('접근 기록을 남기지 못해 열람할 수 없습니다.', 'danger')
      return
    }
    setRevealed(true)
    setAsking(false)
    setReason('')
    toast.show('원본을 열람합니다. 접근 기록이 남았습니다.', 'success')
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span>{masked}</span>
      {/* 마스킹된 값 옆에 붙는 자리라 표 셀 규격(24px)을 명시한다. */}
      <Button variant="outline" density="table" onClick={() => setAsking(true)}>
        보기
      </Button>

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
