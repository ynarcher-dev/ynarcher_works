import { Button, PageHeader, Input } from '@ynarcher/ui'
import { useState } from 'react'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { ImporterModal } from '@/features/networks/ImporterModal'
import { ENTITIES } from '@/features/networks/config'

/**
 * STARTUP 워크스페이스: NETWORKS에서 분리한 스타트업 마스터 디렉토리.
 * 초기 단계로 목록/등록/대량등록만 노출하며, NETWORKS의 스타트업 정의를 재사용한다.
 */
export function StartupPage() {
  const config = ENTITIES.startups
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [keyword, setKeyword] = useState('')

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${config.label} 네트워크`}
        search={
          <Input
            placeholder={`${config.label} 이름 검색`}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              대량 등록(CSV)
            </Button>
            <Button onClick={() => setCreating(true)}>{config.label} 등록</Button>
          </>
        }
      />

      <DirectoryTab
        config={config}
        keyword={keyword}
        creating={creating}
        setCreating={setCreating}
      />

      <ImporterModal
        config={config}
        open={importing}
        onClose={() => setImporting(false)}
      />
    </div>
  )
}
