import { Card, ExpandToggleButton, FullscreenPanel, cn, tableText } from '@ynarcher/ui'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface Props {
  /** 카드 제목 — 예산표 필드의 이름이 그대로 선다(`예산`, `변경 후 예산`). */
  title: string
  help?: string
  /**
   * 전체 화면 머리글에 제목과 나란히 서는 문서 이름.
   *
   * 카드 밖으로 나오면 그 표가 어느 문서의 것인지 말해 주던 주변(문서 머리표·양식 이름)이
   * 함께 사라진다. 그래서 펼친 화면에서는 여기서만 그 사실을 말할 수 있다.
   */
  documentTitle?: string
  /** 표 위에 서는 경고 줄 — 펼친 화면에도 함께 간다(경고를 두고 표만 커지지 않는다). */
  banner?: ReactNode
  children: ReactNode
}

/**
 * 예산표를 담는 카드 — 제목 오른쪽에 **크게보기**를 단다.
 *
 * 예산표는 분류 단계 열에 수량·단가·금액·산출내역이 붙고, 여기에 사용·결재 대기·잔액·사용가능
 * 까지 서면 본문 폭에 다 들어오지 않는다. 열이 밀리면 줄마다 어디까지가 배정이고 어디부터가
 * 집행인지가 끊겨, 결재자가 가장 먼저 견주는 두 숫자를 한 눈에 볼 수 없다.
 *
 * **읽는 화면과 쓰는 화면이 같은 카드를 쓴다.** 예산표가 서는 자리는 상세·기안 둘 다이고, 폭이
 * 모자란 사정도 같다 — 크게보기가 한쪽에만 있으면 같은 표가 화면에 따라 다른 조작을 갖는다.
 * 쓰는 화면에서도 펼친 표는 그대로 고칠 수 있다(같은 값을 보는 같은 입력이다).
 *
 * 카드 본문은 펼친 동안에도 그대로 남는다 — 오버레이가 덮고 있어 보이지 않으며, 닫는 순간
 * 스크롤 위치와 입력 상태가 있던 자리에 그대로 선다(`FullscreenPanel`은 닫히면 아무것도
 * 그리지 않는다).
 */
export function BudgetExpandCard({ title, help, documentTitle, banner, children }: Props) {
  const [expanded, setExpanded] = useState(false)
  const toggle = (
    <ExpandToggleButton
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      expandIcon={<Maximize2 className="h-4 w-4" />}
      collapseIcon={<Minimize2 className="h-4 w-4" />}
    />
  )

  return (
    <>
      <Card title={title} help={help} actions={toggle}>
        {banner}
        {children}
      </Card>

      <FullscreenPanel
        open={expanded}
        onClose={() => setExpanded(false)}
        title={
          <>
            <span className="text-title-sm font-medium text-gray-900">{title}</span>
            {documentTitle && (
              <span className={cn(tableText.body, 'min-w-0 truncate text-gray-600')}>
                {documentTitle}
              </span>
            )}
          </>
        }
        actions={toggle}
      >
        {banner}
        {children}
      </FullscreenPanel>
    </>
  )
}
