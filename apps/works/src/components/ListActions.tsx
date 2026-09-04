import { Button } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'

export interface ListActionsProps {
  /**
   * 등록 버튼 문구. 규칙은 `{대상 명사} 등록` 하나다 — 동사는 '등록'으로 고정하고
   * (생성·추가·새 ~ 를 쓰지 않는다) 명사는 그 목록이 다루는 원장 단위를 적는다.
   * 워크스페이스 설정이 명사를 이미 갖고 있으면 거기서 가져온다(화면에 하드코딩하지 않는다).
   *
   * `onCreate`와 함께 주어야 등록 버튼이 선다. 직접 등록이 성립하지 않는 목록(NETWORKS
   * 미분류 데이터베이스처럼 분류 전 임시 저장소)은 둘 다 생략해 업로드 버튼만 남긴다.
   *
   * 등록 버튼은 무엇을 만들지 되묻지 않고 바로 작성 화면으로 보낸다 — 목록이 하나의 원장을
   * 다루므로 고를 것이 없고, 레코드 안에서 갈리는 값(구분 등)은 작성 폼의 한 칸이 답한다.
   */
  createLabel?: string
  onCreate?: () => void
  /**
   * 대용량 업로드 페이지 경로. 지정하면 등록 버튼 왼쪽에 함께 놓는다.
   * 업로드는 모달이 아니라 전용 페이지다 — 파일을 고르고 열 매칭을 눈으로 확인하는 일이
   * 모달 안에서 하기에는 좁고, 사이드바 메뉴로 두면 어느 원장으로 들어가는지가 드러나지 않는다.
   */
  bulkTo?: string
  /**
   * 페이지 이동 대신 대용량 업로드를 이 자리에서 여는 경우(자산 임포터처럼 지사 컨텍스트를
   * 목록이 이미 들고 있어 모달로 충분한 화면). `bulkTo`와 함께 주지 않는다.
   */
  onBulk?: () => void
  /** 등록 버튼을 잠근다(권한 없음·로딩 중). */
  disabled?: boolean
}

/**
 * 원장 목록 상단 우측 액션 한 쌍(대용량 업로드 · 등록).
 *
 * 목록마다 버튼을 따로 놓다 보니 어떤 화면은 등록이 없고, 어떤 화면은 '생성'·'추가'·'새 ~'로
 * 문구가 갈리고, 업로드 진입 경로도 사이드바·모달·없음으로 제각각이었다. 세 가지를 여기 한 곳에서
 * 정한다 — 순서(업로드 왼쪽, 등록 오른쪽), 강조(등록만 주버튼), 문구 규칙.
 */
export function ListActions({
  createLabel,
  onCreate,
  bulkTo,
  onBulk,
  disabled,
}: ListActionsProps) {
  const navigate = useNavigate()
  const openBulk = onBulk ?? (bulkTo ? () => navigate(bulkTo) : undefined)

  return (
    <div className="flex items-center gap-2">
      {openBulk && (
        <Button variant="outline" density="page" onClick={openBulk}>
          대용량 업로드
        </Button>
      )}
      {createLabel && onCreate && (
        <Button density="page" onClick={onCreate} disabled={disabled}>
          {createLabel}
        </Button>
      )}
    </div>
  )
}
