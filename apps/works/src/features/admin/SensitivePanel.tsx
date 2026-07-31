import { Banner, Button, EmptyValue, PanelCard, Switch, cardText } from '@ynarcher/ui'
import {
  SENSITIVE_CONTENT_GROUPS,
  SENSITIVE_FIELDS,
  SENSITIVE_FIELD_LABEL,
  type SensitiveContent,
  type SensitiveField,
} from '@/features/admin/sensitiveContents'
import { isMasked, useSensitiveStore, type MaskOverrides } from '@/features/admin/sensitiveStore'

/**
 * 민감정보 관리: 콘텐츠(사이드바 메뉴 = 목록 화면)별로 이름·이메일·연락처의 마스킹 여부를 정한다.
 * - 스위치 ON(마스킹): 목록·상세를 가리고, 상세의 "보기"(사유 입력)로만 원본을 연다(접근 로그 기록).
 * - 스위치 OFF(공개): 목록·상세 모두 원본을 표시한다.
 * 화면에 존재하지 않는 필드는 스위치를 두지 않는다 — 켜도 아무 일이 없는 설정을 만들지 않기 위함이다.
 * 근거: docs_dev/4_security_privacy_policy.md(개인정보 목록 마스킹 의무)
 */
export function SensitivePanel() {
  const overrides = useSensitiveStore((s) => s.overrides)
  const setMask = useSensitiveStore((s) => s.setMask)
  const setContentMask = useSensitiveStore((s) => s.setContentMask)
  const resetAll = useSensitiveStore((s) => s.resetAll)

  return (
    <div className="space-y-4">
      <Banner tone="info">
        대상은 <b>외부 인물·기업의 정보</b>입니다 — 네트워크 인물, 스타트업·신청 기업·피투자사의
        대표자명·이메일·연락처. 내부 임직원(담당자 · 생성자 · 운용인력 · 생성자)은 어느 화면에서도
        가리지 않습니다. 스위치를 켜면 해당 화면의 목록·상세를 마스킹하고 상세의{' '}
        <b>보기(사유 입력)</b>로만 원본을 열람할 수 있으며(접근 로그 기록), 끄면 원본을 그대로
        표시합니다. 기본값은 <b>이름 공개 / 이메일·연락처 마스킹</b>입니다.
      </Banner>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={resetAll}>
          기본값으로 되돌리기
        </Button>
      </div>

      {SENSITIVE_CONTENT_GROUPS.map((group) => (
        <PanelCard key={group.key} title={group.label} count={group.contents.length}>
          <div className="divide-y divide-gray-100">
            <HeaderRow />
            {group.contents.map((content) => (
              <ContentRow
                key={content.key}
                content={content}
                overrides={overrides}
                onToggle={(field, masked) => setMask(content.key, field, masked)}
                onToggleAll={(masked) => setContentMask(content.key, masked)}
              />
            ))}
          </div>
        </PanelCard>
      ))}
    </div>
  )
}

/** 필드 열 머리글. 스위치 열과 같은 그리드를 써서 세로줄이 맞도록 한다. */
function HeaderRow() {
  return (
    <div className="flex items-center gap-4 pb-2">
      <div className="flex-1" />
      <div className="grid shrink-0 grid-cols-3 gap-x-6 text-center">
        {SENSITIVE_FIELDS.map((f) => (
          <span key={f} className="w-16 text-caption text-gray-500">
            {SENSITIVE_FIELD_LABEL[f]}
          </span>
        ))}
      </div>
    </div>
  )
}

function ContentRow({
  content,
  overrides,
  onToggle,
  onToggleAll,
}: {
  content: SensitiveContent
  overrides: MaskOverrides
  onToggle: (field: SensitiveField, masked: boolean) => void
  onToggleAll: (masked: boolean) => void
}) {
  const maskedCount = content.fields.filter((f) => isMasked(overrides, content.key, f)).length
  const allMasked = maskedCount === content.fields.length

  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* 콘텐츠명이 이 줄의 주어다 — 아래 상태 설명(회색)과 색으로만 위계를 만든다. */}
          <span className={cardText.value}>{content.label}</span>
          {/* 한 줄 전체 토글: 필드가 여러 개인 인물 원장에서 반복 클릭을 줄인다. */}
          <button
            type="button"
            onClick={() => onToggleAll(!allMasked)}
            className="rounded-radius-sm border border-gray-300 px-1.5 py-0.5 text-caption text-gray-600 transition-colors hover:bg-gray-50"
          >
            {allMasked ? '전체 공개' : '전체 마스킹'}
          </button>
        </div>
        <p className="mt-0.5 truncate text-caption text-gray-500">
          {maskedCount === 0
            ? '전체 원본 표시'
            : `마스킹 ${content.fields
                .filter((f) => isMasked(overrides, content.key, f))
                .map((f) => SENSITIVE_FIELD_LABEL[f])
                .join(' · ')}`}
          {content.hint ? ` · ${content.hint}` : ''}
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-x-6">
        {SENSITIVE_FIELDS.map((field) => (
          <div key={field} className="flex w-16 justify-center">
            {content.fields.includes(field) ? (
              <Switch
                checked={isMasked(overrides, content.key, field)}
                onChange={(v) => onToggle(field, v)}
                aria-label={`${content.label} ${SENSITIVE_FIELD_LABEL[field]} 마스킹`}
              />
            ) : (
              // 화면에 없는 필드는 스위치 대신 자리만 비워 열 정렬을 유지한다.
              <EmptyValue />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
