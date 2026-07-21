import { IconButton } from '@ynarcher/ui'
import { File as FileIcon, Trash2 } from 'lucide-react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { formatBytes } from '@/features/networks/materialHooks'
import type { PendingMaterials } from '@/features/networks/pendingMaterials'

/**
 * 신규 등록 폼용 자료 패널. 대상 레코드가 아직 없으므로 파일을 즉시 업로드하지 않고
 * 보류 목록(`PendingMaterials`)에 담아 두며, 등록 저장 직후 일괄 업로드된다.
 * 조작감(드롭존·목록·삭제)은 상세 수정 폼의 `MaterialPanel`과 동일하게 맞춘다.
 */
export function PendingMaterialPanel({
  slot,
  pending,
  title = '자료 관리',
}: {
  /** 자료 분류 키(스타트업은 분류별 target_type, 네트워크는 단일 슬롯). */
  slot: string
  pending: PendingMaterials
  title?: string
}) {
  const list = pending.files(slot)

  return (
    <DetailPanelCard title={title} count={list.length}>
      <MaterialDropZone onFiles={(files) => pending.add(slot, files)} />

      <div className="mt-3">
        {list.length > 0 ? (
          <ul className="space-y-1.5">
            {list.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-3 py-2"
              >
                <FileIcon className="size-4 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-body text-gray-800">
                  {file.name}
                </span>
                <span className="shrink-0 tabular-nums text-caption text-gray-600">
                  {formatBytes(file.size)}
                </span>
                <IconButton
                  variant="ghost"
                  danger
                  label={`${file.name} 첨부 취소`}
                  onClick={() => pending.remove(slot, i)}
                  icon={<Trash2 className="size-4" />}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-gray-500">첨부한 자료가 없습니다.</p>
        )}
        <p className="mt-2 text-caption text-gray-600">
          첨부한 자료는 등록을 저장할 때 함께 업로드됩니다.
        </p>
      </div>
    </DetailPanelCard>
  )
}
