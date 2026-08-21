import { Button, Dropdown, DropdownItem } from '@ynarcher/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export interface ListActionsProps {
  /**
   * 등록 버튼 문구. 규칙은 `{대상 명사} 등록` 하나다 — 동사는 '등록'으로 고정하고
   * (생성·추가·새 ~ 를 쓰지 않는다) 명사는 그 목록이 다루는 원장 단위를 적는다.
   * 워크스페이스 설정이 명사를 이미 갖고 있으면 거기서 가져온다(화면에 하드코딩하지 않는다).
   *
   * `onCreate`(또는 `createOptions`)와 함께 주어야 등록 버튼이 선다. 직접 등록이 성립하지
   * 않는 목록(NETWORKS 미분류 데이터베이스처럼 분류 전 임시 저장소)은 둘 다 생략해 업로드
   * 버튼만 남긴다.
   */
  createLabel?: string
  onCreate?: () => void
  /**
   * 등록 대상이 목록 안에서 갈리는 경우(원장이 섞인 목록)의 선택지. 지정하면 등록 버튼이
   * 바로 이동하는 대신 이 목록을 드롭다운으로 펼치고, 고른 값을 `onCreateOption`에 넘긴다.
   *
   * 버튼을 없애고 셀렉트 박스를 놓지 않는 이유: 등록은 이 줄에서 유일한 주행동이라 강조가
   * 필요한데, 셀렉트는 필터와 같은 모양이라 조건을 고르는 자리처럼 읽힌다. 대상이 갈린다는
   * 사실은 버튼을 누른 다음에 물으면 된다.
   */
  createOptions?: { value: string; label: string }[]
  onCreateOption?: (value: string) => void
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
  createOptions,
  onCreateOption,
  bulkTo,
  onBulk,
  disabled,
}: ListActionsProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const openBulk = onBulk ?? (bulkTo ? () => navigate(bulkTo) : undefined)
  const hasMenu = Boolean(createOptions?.length && onCreateOption)
  const createButton = createLabel ? (
    <Button
      density="page"
      onClick={hasMenu ? () => setMenuOpen((v) => !v) : onCreate}
      disabled={disabled}
    >
      {createLabel}
    </Button>
  ) : null

  return (
    <div className="flex items-center gap-2">
      {openBulk && (
        <Button variant="outline" density="page" onClick={openBulk}>
          대용량 업로드
        </Button>
      )}
      {createButton && hasMenu && (
        <Dropdown
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          align="right"
          trigger={createButton}
        >
          {createOptions?.map((o) => (
            <DropdownItem
              key={o.value}
              onClick={() => {
                setMenuOpen(false)
                onCreateOption?.(o.value)
              }}
            >
              {o.label}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
      {createButton && !hasMenu && onCreate && createButton}
    </div>
  )
}
