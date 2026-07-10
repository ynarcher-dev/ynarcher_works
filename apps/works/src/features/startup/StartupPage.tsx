import { Button, PageHeader, Input, EmptyState } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StartupPoolTab } from '@/features/startup/StartupPoolTab'
import { ImporterModal } from '@/features/networks/ImporterModal'
import { ENTITIES } from '@/features/networks/config'

const HEADINGS: Record<string, string> = {
  dashboard: '대시보드',
  invested: '투자기업',
  incubated: '보육기업',
  discovered: '발굴기업',
  minutes: '회의록',
  archerscan: '아처스캔',
  bulk: '대용량 업로드',
}

/**
 * STARTUP 워크스페이스: 대시보드 / 투자·보육·발굴 기업 / 회의록 / 아처스캔.
 * 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * 발굴기업(discovered)만 기존 스타트업 마스터 디렉토리를 노출하고, 나머지는 준비 중 골격이다.
 */
export function StartupPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'dashboard'
  const config = ENTITIES.startups
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [keyword, setKeyword] = useState('')

  // 섹션(탭) 전환 시 이전 검색어를 비운다(NETWORKS 디렉토리와 동일 UX).
  useEffect(() => {
    setKeyword('')
  }, [tab])

  // 검색 필드·등록 액션은 발굴기업(디렉토리)에서만 노출한다.
  const searchField =
    tab === 'discovered' ? (
      <Input
        placeholder={`${config.label} 이름 검색`}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
    ) : undefined

  const actions =
    tab === 'discovered' ? (
      <>
        <Button variant="outline" onClick={() => setImporting(true)}>
          대량 등록(CSV)
        </Button>
        <Button onClick={() => setCreating(true)}>{config.label} 등록</Button>
      </>
    ) : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title={HEADINGS[tab] ?? HEADINGS.dashboard}
        search={searchField}
        actions={actions}
      />

      {tab === 'discovered' ? (
        <>
          <StartupPoolTab
            keyword={keyword}
            creating={creating}
            setCreating={setCreating}
          />
          <ImporterModal
            config={config}
            open={importing}
            onClose={() => setImporting(false)}
          />
        </>
      ) : (
        <EmptyState
          title={`${HEADINGS[tab] ?? '대시보드'} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      )}
    </div>
  )
}
