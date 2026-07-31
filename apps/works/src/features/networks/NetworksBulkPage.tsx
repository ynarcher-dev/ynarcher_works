import { BackButton, DetailTopBar, PageHeader } from '@ynarcher/ui'
import { Link, useSearchParams } from 'react-router-dom'
import { BulkUploadSection, type BulkScope } from '@/features/networks/BulkUploadSection'

/**
 * NETWORKS 대용량 업로드 전용 페이지(`/networks/bulk`).
 *
 * 전에는 사이드바 '데이터 관리 › 대용량 업로드' 메뉴였다. 목록의 버튼으로 옮긴 이유는 두 가지다 —
 * 사이드바 항목은 어느 원장으로 들어가는 업로드인지 이름에 드러나지 않았고, 등록과 업로드가
 * 같은 일(원장에 행을 넣는다)인데 진입 경로가 갈려 있었다. 이제 둘은 목록 상단에 나란히 선다.
 *
 * 국내(9종)·글로벌은 임포터의 판정 로직 자체가 달라(구분 재분류 vs 단일 마스터) 한 화면 안에서
 * 탭으로 가른다. 목록에서 넘어올 때 `?scope=global`로 어느 탭을 열지 지정한다.
 */
export function NetworksBulkPage() {
  const [params] = useSearchParams()
  const scope: BulkScope = params.get('scope') === 'global' ? 'global' : 'domestic'

  return (
    <div className="space-y-5">
      {/* 돌아갈 곳은 넘어온 목록이다. 국내는 첫 원장(전문가), 글로벌은 글로벌 목록. */}
      <DetailTopBar
        back={
          <BackButton
            as={Link}
            to={scope === 'global' ? '/networks?tab=global' : '/networks?tab=experts'}
          />
        }
      />
      <PageHeader title="네트워크 대용량 업로드" />
      <BulkUploadSection initialScope={scope} />
    </div>
  )
}
