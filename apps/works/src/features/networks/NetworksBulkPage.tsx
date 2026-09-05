import { BackButton, DetailTopBar, PageHeader } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { BulkUploadPanel } from '@/features/networks/BulkUploadPanel'

/**
 * NETWORKS 대용량 업로드 전용 페이지(`/networks/bulk`).
 *
 * 전에는 사이드바 '데이터 관리 › 대용량 업로드' 메뉴였다. 목록의 버튼으로 옮긴 이유는 두 가지다 —
 * 사이드바 항목은 어느 원장으로 들어가는 업로드인지 이름에 드러나지 않았고, 등록과 업로드가
 * 같은 일(원장에 행을 넣는다)인데 진입 경로가 갈려 있었다. 이제 둘은 목록 상단에 나란히 선다.
 *
 * 국내/글로벌 인페이지 탭은 2026-09-04 원장 통합으로 사라졌다 — 임포터가 하나이고, 국가는
 * 파일의 한 열이다.
 */
export function NetworksBulkPage() {
  return (
    <div className="space-y-5">
      <DetailTopBar back={<BackButton as={Link} to="/networks?scope=all" />} />
      <PageHeader title="네트워크 대용량 업로드" />
      <BulkUploadPanel />
    </div>
  )
}
