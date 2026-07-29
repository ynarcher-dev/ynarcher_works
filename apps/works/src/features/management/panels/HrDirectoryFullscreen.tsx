import { Button, Input } from '@ynarcher/ui'
import { Minimize2 } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { EmployeeDirectory } from '@/features/management/EmployeeDirectory'

interface HrDirectoryFullscreenProps {
  open: boolean
  /** 검색어는 페이지 헤더와 공유한다 — 크게보기를 닫아도 조건이 유지된다. */
  keyword: string
  onKeywordChange: (v: string) => void
  onClose: () => void
}

/**
 * 인사 관리 임직원 목록 '크게보기' — 전체화면 오버레이(z-500, Esc 닫힘).
 * 목록 컬럼이 소속 티어·지사·집계까지 늘어나 본문 폭에서는 가로 스크롤로만 볼 수 있는데,
 * 화면 전체를 쓰면 대부분의 컬럼이 한눈에 들어온다. 표 자체는 EmployeeDirectory 하나를
 * 그대로 재사용한다(컬럼 정의가 두 벌이 되면 한쪽만 갱신되는 문제가 생긴다).
 * 근거: FUND 포트폴리오 보드 '전체보기'와 동일한 오버레이 규격.
 */
export function HrDirectoryFullscreen({
  open,
  keyword,
  onKeywordChange,
  onClose,
}: HrDirectoryFullscreenProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col bg-gray-25">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <span className="text-title-sm font-medium text-gray-900">인사 관리</span>
        <div className="flex items-center gap-2">
          <Input
            placeholder="임직원 이름 검색"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" onClick={onClose}>
            <Minimize2 size={14} /> 축소
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-auto px-6 py-6">
        <EmployeeDirectory keyword={keyword} />
      </div>
    </div>,
    document.body,
  )
}
