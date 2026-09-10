import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'
import { DensityProvider } from '../density'
import { tooltipScale } from '../densityScale'
import { Tooltip } from './Tooltip'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

/**
 * 폭은 `modal-*` 토큰이 소유한다(400/600/800/1000/1200/1400).
 *
 * `3xl`은 **폭을 우리가 정하지 못하는 자리**에 쓴다. 2xl과 가르는 기준은 중요도가 아니라 폭을
 * 정하는 주체다 — 2xl까지는 우리가 정한 열 구성이 폭을 정하지만, 여기서는 데이터가 정한다.
 * 좁히면 줄어드는 것이 여백이 아니라 담당자가 한 번에 보는 값이다.
 *
 * 해당하는 자리는 둘이다. **격자**(행과 열이 모두 데이터인 표)는 열 수가 데이터라 우리가 못
 * 정하고, **좌우로 옮기는 창**(`TransferPanes`)은 한 줄에 서는 값의 개수가 원장이 정한 것이라
 * 못 정한다 — 좁히면 이메일과 연락처가 잘려, 고른 대상이 맞는지 확인하려고 연 창에서 확인할
 * 값이 사라진다(2026-09-10).
 *
 * 근거: 5_component_spec_rules.md §4.1
 */
const sizeClass: Record<ModalSize, string> = {
  sm: 'max-w-modal-sm',
  md: 'max-w-modal-md',
  lg: 'max-w-modal-lg',
  xl: 'max-w-modal-xl',
  '2xl': 'max-w-modal-2xl',
  '3xl': 'max-w-modal-3xl',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /**
   * 이 모달에서 하는 일의 규칙·파급 효과. 제목 옆 도움말(ⓘ) 말풍선으로 접힌다.
   *
   * 본문 맨 위나 맨 아래에 안내 문단으로 깔려 있던 자리다(2026-09-01). 모달은 본문이 곧
   * 작업 영역이라 안내 문단이 그 앞에 서면, 열자마자 읽어야 할 것이 입력 칸이 아니라 설명이
   * 된다. 다만 **막힌 이유·되돌릴 수 없음 경고**는 접지 않고 본문에 그대로 둔다.
   */
  help?: ReactNode
  size?: ModalSize
  children: ReactNode
  footer?: ReactNode
  /**
   * 딤(바깥 영역) 클릭으로 닫을 수 있는지(기본 true).
   *
   * 가르는 축은 **잃을 것이 있는가**다. 읽기만 하는 모달은 바깥을 눌러 가볍게 닫히는 편이
   * 낫고(닫아도 잃는 것이 없다), 무언가 쓰고 있는 모달은 클릭 한 번에 쓰던 글이 사라지면
   * 안 되므로 `false`로 잠가 닫는 길을 푸터의 취소 버튼 하나로 좁힌다.
   */
  dismissible?: boolean
  /**
   * 본문을 **카드 여러 장으로 나누는** 모달인가.
   *
   * 켜면 본문 바닥이 흰색에서 회색(gray-100)으로 내려가고 카드 사이 간격이 함께 붙는다. 카드가
   * 흰 바닥 위에 흰 상자로 서면 테두리 한 줄만으로 구획을 버텨야 해서, 칸이 서넛만 넘어가도
   * 어디까지가 한 묶음인지 눈이 따라가지 못한다 — 표면은 그림자가 아니라 헤어라인 테두리와
   * 바닥의 색차로 구획한다는 규칙(4_color_system_rules)이 모달 안에서도 그대로여야 한다.
   *
   * 화면이 아니라 여기가 소유하는 이유는 이 자리가 **본문 여백을 아는 유일한 곳**이기 때문이다.
   * 종전에는 네 곳이 `-mx-5 -my-4 … px-5 py-4`로 본문 패딩을 손으로 되돌려 칠했고, 그 숫자는
   * 아래 본문 클래스와 짝이라 한쪽만 고치면 바닥이 어긋난 채로 남는다.
   */
  sectioned?: boolean
}

/**
 * 모달 다이얼로그(sm/md/lg). 딤 레이어 z-overlay, 바디 z-modal.
 * 근거: 8_z_index_system_rules.md, 6_motion_transition_rules.md §4.2
 */
export function Modal({
  open,
  onClose,
  title,
  help,
  size = 'md',
  children,
  footer,
  dismissible = true,
  sectioned = false,
}: ModalProps) {
  if (!open) return null
  return createPortal(
    // 밀도 맥락을 'page'로 되돌린다. 포털은 DOM만 body로 옮길 뿐 React 컨텍스트는 부모를 그대로
    // 따르므로, 카드나 표 셀 안에서 연 모달의 폼이 32px·24px로 쪼그라들던 것을 막는다.
    <DensityProvider value="page">
    <div className="fixed inset-0 z-overlay flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/35 backdrop-blur-[2px] transition-opacity duration-slow ease-decelerate"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          // 헤더·푸터는 고정하고 본문만 스크롤되도록 flex 컬럼 + 최대 높이 제한(뷰포트-여백).
          // eslint-disable-next-line no-restricted-syntax -- 다이얼로그의 정본. radius-lg는 카드와 모달이 함께 쓰는 단계이며(§1.1), 이 상자는 카드가 아니라 모달 자신이다.
          'relative z-modal flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-radius-lg border border-white/70 bg-white shadow-dialog transition-all duration-slow ease-decelerate',
          sizeClass[size],
        )}
      >
        {title && (
          <header className="shrink-0 border-b border-gray-200 bg-gray-25/70 px-5 py-3.5">
            <h2 className="flex items-center text-title-sm font-medium text-gray-900">
              {title}
              {help && (
                <Tooltip
                  content={help}
                  label={typeof title === 'string' ? title : undefined}
                  className={cn('shrink-0', tooltipScale.gap)}
                />
              )}
            </h2>
          </header>
        )}
        <div
          className={cn(
            'flex-1 overflow-y-auto px-5 py-4 text-body text-gray-800',
            sectioned && 'space-y-3 bg-gray-100',
          )}
        >
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 flex justify-end gap-2 border-t border-gray-200 bg-gray-25/70 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
    </DensityProvider>,
    document.body,
  )
}
