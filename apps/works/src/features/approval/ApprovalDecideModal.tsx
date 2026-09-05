import { Button, Checkbox, Field, Modal, Radio, Select, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useDecideApproval } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, type ApprovalLineKind } from '@/features/approval/config'

type Decision = 'APPROVED' | 'REJECTED'

/** 되돌릴 수 있는 자리 한 곳 — 같은 구분에서 이미 승인한 앞 순번. */
export interface ReturnTarget {
  /** 원장의 step_order(서버가 이 값으로 대상을 찾는다). */
  stepOrder: number
  /** 표에 선 순번(사람이 읽는 숫자 — step_order와 다를 수 있다). */
  seq: number
  name: string
}

interface ApprovalDecideModalProps {
  open: boolean
  onClose: () => void
  documentId: string
  /** 지금 처리해야 할 내 결재선 행. */
  lineId: string
  /** 내 자리의 구분(결재·합의·재무합의) — 제목과 안내 문구가 이 말을 따른다. */
  kind: ApprovalLineKind
  /** 내가 마지막 한 표인가(승인 시 문서가 최종 승인으로 끝난다). */
  isFinal: boolean
  /** 되돌릴 수 있는 앞 순번(순번 오름차순). 비어 있으면 목적지 선택이 서지 않는다. */
  returnTargets: ReturnTarget[]
  /** 다른 구분(합의·재무합의)에 결재선이 있는가 — 재요청 체크박스를 세울지 가른다. */
  hasAgreementLines: boolean
}

/**
 * 결재 처리(승인·되돌림) 창 — 내 차례일 때 상단 [○○ 처리] 버튼으로 연다.
 *
 * **상시로 서 있던 우측 카드에서 창으로 옮겼다**(2026-08-26, 하이웍스 방식). 결재는 문서를
 * 다 읽은 뒤 한 번 내리는 판단이라, 처리 칸이 문서 옆에 늘 펼쳐져 있으면 읽는 동안 내내
 * 승인·반려 버튼이 시야에 머문다 — 읽기 전에 누를 수 있는 자리에 있는 것 자체가 오처리를
 * 부른다. 창으로 두면 "처리하겠다"는 의사를 한 번 밝힌 사람만 그 앞에 선다.
 *
 * 승인·반려를 버튼 둘로 갈라 두지 않고 **라디오 하나로 고르게** 한다. 버튼이 둘이면 어느
 * 쪽을 누르는지가 곧 결정이라 손이 먼저 나가지만, 고른 뒤 [확인]을 누르는 흐름은 무엇을
 * 고른 상태인지 눈으로 확인하는 단계를 강제한다(하이웍스도 같은 형태다).
 *
 * **반려는 목적지를 갖는다**(2026-09-05, 3_1_3). 반려를 고르면 `돌아갈 곳`과 `기안자가 고쳐
 * 다시 올려야 함`이 펼쳐진다. 두 칸을 하나로 합치지 않은 이유는 "누가 다시 보는가"와
 * "내용을 고치는가"가 독립된 질문이고 네 조합이 모두 다른 결과를 내기 때문이다. **접힌
 * 기본값은 종전 반려와 같아서**, 아무것도 만지지 않고 반려하면 지금까지와 똑같이 동작한다.
 *
 * 의견은 결재 행위에 붙는 기록이라 문서 코멘트(우측 의견 패널)와 축이 다르다. 코멘트는
 * 누구나 언제든 남기는 대화이고, 이 의견은 "왜 승인·되돌렸는가"로 결재선 행에 남는다.
 *
 * 최종 판정(내 행인가·내 차례인가·되돌릴 수 있는 자리인가)은 전부 서버 RPC가 다시 한다.
 */
export function ApprovalDecideModal({
  open,
  onClose,
  documentId,
  lineId,
  kind,
  isFinal,
  returnTargets,
  hasAgreementLines,
}: ApprovalDecideModalProps) {
  const toast = useToast()
  const decide = useDecideApproval()
  const [decision, setDecision] = useState<Decision>('APPROVED')
  const [comment, setComment] = useState('')
  // 돌아갈 곳 — 빈 문자열이 '처음부터'(목적지 없는 종전 반려)다.
  const [returnStep, setReturnStep] = useState('')
  const [viaDrafter, setViaDrafter] = useState(true)
  // 합의 재요청은 기안자 경유를 따라가되 사용자가 뒤집을 수 있다. 뒤집기 전에는 연동
  // 상태로 두어야 '기안자 경유'를 끄는 순간 함께 풀린다 — 그래서 null이 '아직 안 만짐'이다.
  const [resetAgreement, setResetAgreement] = useState<boolean | null>(null)
  const kindLabel = LINE_KIND_LABEL[kind]
  const effectiveReset = resetAgreement ?? viaDrafter

  const close = () => {
    // 다음에 열 때는 늘 승인이 골라진 채로 시작한다 — 앞서 반려를 골랐던 것이 남아 있으면
    // 다른 문서를 처리하러 들어온 사람이 자기가 고르지 않은 값을 확인하게 된다.
    setDecision('APPROVED')
    setComment('')
    setReturnStep('')
    setViaDrafter(true)
    setResetAgreement(null)
    onClose()
  }

  const target = returnTargets.find((t) => String(t.stepOrder) === returnStep) ?? null

  /** 고른 조합을 그대로 되읽는다 — 되돌림은 조합마다 일어나는 일이 다르다. */
  const summary = (): string => {
    if (decision === 'APPROVED') {
      return isFinal ? '승인하시겠습니까? 남은 처리가 이것뿐이라 문서가 완료됩니다.' : '승인하시겠습니까?'
    }
    const where = target ? `${target.seq}번 ${target.name}부터` : '처음부터'
    const kept = target ? ' 앞 순번의 승인은 그대로 유지됩니다.' : ''
    return viaDrafter
      ? `기안자에게 돌려보냅니다. 기안자가 문서를 고쳐 다시 올리면 ${where} 다시 받습니다.${kept}`
      : `내용을 고치지 않고 ${where} 다시 받습니다. 기안자를 거치지 않고 곧바로 그 사람의 차례가 됩니다.${kept}`
  }

  const submit = async () => {
    try {
      await decide.mutateAsync({
        lineId,
        documentId,
        decision,
        comment,
        returnTo:
          decision === 'REJECTED'
            ? {
                returnToStep: target?.stepOrder ?? null,
                viaDrafter,
                resetAgreement: effectiveReset,
              }
            : undefined,
      })
      toast.show(
        decision === 'APPROVED' ? '승인했습니다.' : viaDrafter ? '반려했습니다.' : '반송했습니다.',
        'success',
      )
      close()
    } catch {
      toast.show('처리에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={kindLabel}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={decide.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={decide.isPending}>
            확인
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-5">
          <Radio
            name="approval-decision"
            label="승인"
            checked={decision === 'APPROVED'}
            onChange={() => setDecision('APPROVED')}
          />
          <Radio
            name="approval-decision"
            label="반려"
            checked={decision === 'REJECTED'}
            onChange={() => setDecision('REJECTED')}
          />
        </div>

        {/* 되돌림 지정은 반려를 고른 사람에게만 펼친다 — 승인하는 손에게는 답할 질문이 아니다. */}
        {decision === 'REJECTED' && (
          <div className="space-y-3 rounded-radius-md border border-gray-200 bg-gray-25 p-3">
            {returnTargets.length > 0 && (
              <Field
                label="돌아갈 곳"
                hint="앞 순번을 고르면 그 앞의 승인은 유지된 채 거기서부터 다시 받습니다. 건너뛴 단계는 결재선 표에 그대로 남습니다."
              >
                <Select
                  density="card"
                  value={returnStep}
                  onChange={(e) => setReturnStep(e.target.value)}
                >
                  <option value="">처음부터 (전원 다시)</option>
                  {returnTargets.map((t) => (
                    <option key={t.stepOrder} value={String(t.stepOrder)}>
                      {t.seq}번 {t.name}부터
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Checkbox
              label="기안자가 문서를 고쳐 다시 올려야 함"
              checked={viaDrafter}
              onChange={(e) => setViaDrafter(e.target.checked)}
            />
            {/* 합의 줄은 되돌린 사람이 고른다 — 무엇이 바뀌었는지는 그가 안다. 규칙으로 못
                박으면 두 방향 모두 틀린다(금액이 바뀌면 재무합의를 다시 받아야 하지만,
                오탈자 하나 고친 문서를 재무팀이 또 보는 것은 낭비다). */}
            {hasAgreementLines && (
              <Checkbox
                label="합의·재무합의도 다시 받기"
                checked={effectiveReset}
                onChange={(e) => setResetAgreement(e.target.checked)}
              />
            )}
          </div>
        )}

        {/* 고른 것이 무엇을 뜻하는지 되묻는다 — 되돌림은 조합마다 일어나는 일이 다르고,
            마지막 한 표일 때는 이 처리로 문서가 끝난다는 사실이 승인 여부만큼 중요하다. */}
        <p className="text-body-sm text-gray-700">{summary()}</p>

        <TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="의견을 입력하세요."
        />
      </div>
    </Modal>
  )
}
