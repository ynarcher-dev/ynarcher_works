import { Input, Modal, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { useEntityList, type EntityRow } from '@/features/networks/hooks'
import { readIndustries } from '@/features/startup/startupGrowth'

interface Props {
  open: boolean
  onClose: () => void
  /** 선택 확정 콜백(선택된 기업 id 전달). */
  onPick: (id: string) => void
  /** 목록에서 제외할 기업 id(현재 기업 자기 자신). */
  excludeId?: string
}

/**
 * 비교기업 선택 모달. 기업명 검색(ilike) 결과를 로고·이름·산업 리스트로 보여주고,
 * 행을 클릭하면 해당 기업을 비교 대상으로 확정한다. 현재 기업 자신은 목록에서 제외한다.
 */
export function StartupComparePicker({ open, onClose, onPick, excludeId }: Props) {
  const [keyword, setKeyword] = useState('')
  const { data, isLoading } = useEntityList('startups', keyword)
  const rows = ((data ?? []) as EntityRow[]).filter((r) => r.id !== excludeId)

  return (
    <Modal open={open} onClose={onClose} title="비교기업 선택" size="md">
      <div className="space-y-3">
        <Input
          autoFocus
          placeholder="기업명으로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <div className="max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-body text-gray-500">검색 결과가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => {
                const logo = r.logo_url ? String(r.logo_url) : null
                const industry = readIndustries(r).join(' · ')
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(r.id)
                        onClose()
                      }}
                      className="flex w-full items-center gap-3 rounded-radius-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                    >
                      <PhotoBox src={logo} className="size-9 rounded-radius-md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-gray-900">{r.name}</p>
                        {industry && <p className="truncate text-caption text-gray-600">{industry}</p>}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
