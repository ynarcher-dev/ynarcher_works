import { useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EntityFormModal } from '@/features/networks/EntityFormModal'
import { useEntityPage, useUpdateEntity } from '@/features/networks/hooks'
import { isProfileEntity, type EntityConfig } from '@/features/networks/config'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface DirectoryTabProps {
  config: EntityConfig
  keyword: string
  creating: boolean
  setCreating: (c: boolean) => void
}

/**
 * 엔티티 디렉토리 탭: 목록(공용 리스트뷰) + 등록.
 * 프로필 엔티티(전문가·VAN·투자사)는 행 클릭 시 상세페이지로 진입해 편집한다(모달 미사용).
 * 그 외 엔티티는 등록 모달을 유지한다.
 */
export function DirectoryTab({ config, keyword, creating, setCreating }: DirectoryTabProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const update = useUpdateEntity(config.table)
  const [page, setPage] = useState(0)
  // 검색어·엔티티 전환 시 첫 페이지로 되돌린다(빈 페이지 노출 방지).
  useEffect(() => {
    setPage(0)
  }, [keyword, config.table])
  const { data, isLoading } = useEntityPage(config.table, keyword, page, PAGE_SIZE)
  const hasDetailPage = isProfileEntity(config.key)

  const deactivate = async (row: MasterRow) => {
    try {
      await update.mutateAsync({
        id: row.id,
        values: { deleted_at: new Date().toISOString() },
      })
      toast.show(`${config.label}을(를) 비활성화했습니다.`, 'success')
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-3">
      <MasterListView
        label={config.label}
        columns={config.listColumns ?? config.fields}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        onRowClick={
          hasDetailPage
            ? (r) => navigate(`/networks/${config.key}/${r.id}`)
            : undefined
        }
        onDeactivate={deactivate}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalAll: data?.totalAll ?? 0,
          onChange: setPage,
        }}
      />

      {/* 프로필 엔티티는 상세페이지에서 등록하므로 모달을 렌더하지 않는다. */}
      {!hasDetailPage && (
        <EntityFormModal
          config={config}
          open={creating}
          onClose={() => setCreating(false)}
          initial={null}
        />
      )}
    </div>
  )
}
