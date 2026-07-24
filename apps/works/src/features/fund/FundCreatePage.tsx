import { useNavigate } from 'react-router-dom'
import { FundForm } from '@/features/fund/FundForm'

/**
 * 펀드 신규 등록 페이지(모달 아님). 펀드 현황의 '펀드 등록'에서 진입하며,
 * 상세 수정과 동일한 페이지형 폼(FundForm)을 등록 모드로 재사용한다.
 * 등록 완료 시 생성된 펀드 상세로 이동한다.
 */
export function FundCreatePage() {
  const navigate = useNavigate()
  return (
    <FundForm
      onCancel={() => navigate('/fund')}
      onDone={(id) => navigate(`/fund/${id}`)}
    />
  )
}
