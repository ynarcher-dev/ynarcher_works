import { Banner, Switch } from '@ynarcher/ui'
import { SENSITIVE_FIELDS, useSensitiveStore } from '@/features/admin/sensitiveStore'

/**
 * 민감정보 관리: 이메일/연락처 등 개인정보의 노출 정책을 필드별 스위치로 통합 제어한다(목록+상세 공통).
 * - 공개(ON): 목록·상세 모두 원본을 표시한다.
 * - 마스킹(OFF): 목록·상세 모두 마스킹하고, 상세 "보기"에서 사유 입력 후 열람한다(접근 로그 기록).
 * 근거: docs_dev/4_security_privacy_policy.md(개인정보 목록 마스킹 의무)
 */
export function SensitivePanel() {
  const show = useSensitiveStore((s) => s.show)
  const setShow = useSensitiveStore((s) => s.setShow)

  return (
    <div className="space-y-4">
      <Banner tone="info">
        필드별로 <b>목록과 상세를 함께</b> 제어합니다. 스위치를 켜면 목록·상세 모두 원본을 표시하고,
        끄면 목록·상세를 마스킹하되 상세의 <b>보기(사유 입력)</b>로만 원본을 열람할 수 있습니다(접근 로그 기록).
      </Banner>

      <div className="divide-y divide-gray-200 rounded-radius-lg border border-gray-200 bg-white shadow-soft">
        {SENSITIVE_FIELDS.map((f) => (
          <SensitiveRow
            key={f.key}
            label={f.label}
            show={show[f.key]}
            onChange={(v) => setShow(f.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

function SensitiveRow({
  label,
  show,
  onChange,
}: {
  label: string
  show: boolean
  onChange: (v: boolean) => void
}) {
  const id = `sensitive-${label}`
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <label htmlFor={id} className="text-body font-medium text-gray-900">
          {label}
        </label>
        <p className="mt-0.5 text-caption text-gray-600">
          {show
            ? '목록·상세 모두 원본을 표시합니다.'
            : '목록·상세를 마스킹하고, 상세 "보기"에서 사유 입력 후 열람합니다(접근 로그 기록).'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-caption text-gray-600">
          {show ? '전체 공개' : '마스킹(상세 열람)'}
        </span>
        <Switch
          id={id}
          checked={show}
          onChange={onChange}
          aria-label={`${label} 노출 정책`}
        />
      </div>
    </div>
  )
}
