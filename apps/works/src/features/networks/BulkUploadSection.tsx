import { Tabs, type TabItem } from '@ynarcher/ui'
import { useState } from 'react'
import { BulkUploadPanel } from '@/features/networks/BulkUploadPanel'
import { GlobalBulkUploadPanel } from '@/features/networks/GlobalBulkUploadPanel'

/** 업로드 대상 범위. 국내 9종 원장 ↔ 글로벌 단일 마스터. */
export type BulkScope = 'domestic' | 'global'

const TABS: TabItem[] = [
  { key: 'domestic', label: '국내 네트워크' },
  { key: 'global', label: '글로벌 네트워크' },
]

/**
 * 대용량 업로드 섹션. 국내(9종)·글로벌 임포터를 한 화면에서 인페이지 탭으로 전환한다.
 * 사이드바 메뉴는 '대용량 업로드' 하나로 두고, 여기서 대상 범위만 탭으로 가른다.
 * 각 패널은 서로 독립적인 파일/리뷰 상태를 가지므로, 탭 전환 시 진행 중이던 작업이 유지되도록
 * 두 패널을 동시에 마운트한 채 숨김/노출만 토글한다(언마운트하면 올려둔 CSV·리뷰가 사라진다).
 */
export function BulkUploadSection({ initialScope = 'domestic' }: { initialScope?: BulkScope }) {
  const [scope, setScope] = useState<BulkScope>(initialScope)
  return (
    <div className="space-y-4">
      <Tabs items={TABS} value={scope} onChange={(k) => setScope(k as BulkScope)} />
      <div className={scope === 'domestic' ? undefined : 'hidden'}>
        <BulkUploadPanel />
      </div>
      <div className={scope === 'global' ? undefined : 'hidden'}>
        <GlobalBulkUploadPanel />
      </div>
    </div>
  )
}
