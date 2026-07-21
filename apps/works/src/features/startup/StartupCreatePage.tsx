import { useNavigate } from 'react-router-dom'
import { StartupDetailForm } from '@/features/startup/StartupDetailForm'

/** 발굴기업 목록 경로(뒤로가기·취소 목적지). */
const LIST_PATH = '/startup?tab=discovered'

/**
 * 스타트업 신규 등록 페이지(모달 아님). 발굴기업 목록의 '스타트업 등록'에서 진입하며,
 * 상세 수정과 동일한 입력 폼(StartupDetailForm)을 등록 모드로 재사용한다.
 * 등록 완료 시 생성된 레코드의 상세페이지로 이동한다.
 */
export function StartupCreatePage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-5">
      {/* 상단 바(뒤로가기 ↔ 취소·등록)는 폼이 소유한다. */}
      <StartupDetailForm
        backTo={LIST_PATH}
        onDone={(id) => navigate(`/startup/discovered/${id}`)}
        onCancel={() => navigate(LIST_PATH)}
      />
    </div>
  )
}
