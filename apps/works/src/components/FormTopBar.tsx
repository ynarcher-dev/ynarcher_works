import { BackButton, Button, DetailTopBar } from '@ynarcher/ui'
import { Link } from 'react-router-dom'

/**
 * 등록/수정 폼의 확정 버튼 문구. 화면마다 '저장'·'계정 생성'·'수정 완료'가 섞여 있던 것을
 * 여기 한 곳으로 모은다 — 같은 동작이 화면마다 다른 이름을 갖지 않게 한다.
 */
export const FORM_SUBMIT_LABEL = { create: '등록', edit: '수정' } as const

export interface FormTopBarProps {
  /** 뒤로가기 목적지(목록 경로). */
  backTo: string
  /** 확정 버튼 문구를 가르는 축(신규 등록 / 기존 수정). */
  mode: 'create' | 'edit'
  onCancel: () => void
  /** 저장 진행 중이면 두 버튼을 모두 잠근다. */
  busy?: boolean
  /**
   * 네이티브 폼 제출(`<form onSubmit>`)이 아닌 폼에서 쓰는 확정 핸들러.
   * 주입하면 확정 버튼이 `type="button"`으로 바뀐다.
   */
  onSubmit?: () => void
}

/**
 * 등록/수정 폼 상단 바 — 좌측 뒤로가기, 우측 취소·확정 버튼.
 *
 * 확정 버튼을 폼 맨 아래에 두면 스타트업·네트워크처럼 카드가 길게 이어지는 폼에서
 * 화면 끝까지 스크롤해야 저장할 수 있었다. 조회 화면의 '수정' 버튼과 같은 자리(우상단)에
 * 두어, 편집 진입 전후로 주요 액션의 위치가 흔들리지 않게 한다.
 *
 * 상단 바 아래에 '네트워크 등록' 같은 제목 줄은 두지 않는다 — 어떤 화면에서 무엇을 편집하는지는
 * 직전 목록과 폼 내용이 이미 말해 준다.
 *
 * 수정 모드는 뒤로가기·수정 두 버튼만 둔다 — 조회 화면과 같은 자리에서 '뒤로가기'가 편집 취소(조회
 * 복귀)를 겸하므로 별도 '취소' 버튼을 두지 않는다. 신규 등록 모드는 되돌아갈 조회 화면이 없어
 * 뒤로가기(목록)와 취소·등록을 그대로 유지한다.
 */
export function FormTopBar({ backTo, mode, onCancel, busy, onSubmit }: FormTopBarProps) {
  const submitButton = (
    <Button type={onSubmit ? 'button' : 'submit'} onClick={onSubmit} disabled={busy}>
      {FORM_SUBMIT_LABEL[mode]}
    </Button>
  )
  if (mode === 'edit') {
    // 뒤로가기가 곧 편집 취소(조회 화면 복귀)다. 목록으로 나가지 않는다.
    return (
      <DetailTopBar
        back={<BackButton onClick={onCancel} />}
        actions={submitButton}
      />
    )
  }
  return (
    <DetailTopBar
      back={<BackButton as={Link} to={backTo} />}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          {submitButton}
        </>
      }
    />
  )
}
