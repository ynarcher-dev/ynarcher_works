import { IconButton, panelRowBox, tableText } from '@ynarcher/ui'
import { File as FileIcon, Link as LinkIcon, Trash2 } from 'lucide-react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialLinkInput } from '@/features/networks/MaterialLinkInput'
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
  /** 자료 분류 키(= 업로드 시 target_type). */
  slot: string
  pending: PendingMaterials
  title?: string
}) {
  const list = pending.files(slot)
  const links = pending.links(slot)

  return (
    <DetailPanelCard
      title={title}
      count={list.length + links.length}
      help="첨부한 자료는 등록을 저장할 때 함께 업로드됩니다."
    >
      <MaterialDropZone onFiles={(files) => pending.add(slot, files)} />
      <MaterialLinkInput onAdd={(url) => pending.addLink(slot, url)} />

      {links.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {links.map((url, i) => (
            <li
              key={url}
              className={`flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white ${panelRowBox}`}
            >
              <LinkIcon className="size-4 shrink-0 text-gray-500" />
              {/* 저장 전이라 제목을 아직 모른다(제목은 저장 시점에 서버가 읽어 채운다).
                  그동안은 주소가 그 자리를 대신한다 — 빈 이름보다 낫다. */}
              <span className={`min-w-0 flex-1 truncate ${tableText.primary}`} title={url}>
                {url}
              </span>
              {/* 파일 행의 용량 자리를 링크는 종류로 채운다 — 자료 관리 목록과 같은 규격이다. */}
              <span className={`shrink-0 ${tableText.meta}`}>link</span>
              <IconButton
                variant="ghost"
                danger
                label={`${url} 첨부 취소`}
                onClick={() => pending.removeLink(slot, i)}
                icon={<Trash2 className="size-4" />}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        {list.length > 0 ? (
          <ul className="space-y-1.5">
            {list.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className={`flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white ${panelRowBox}`}
              >
                <FileIcon className="size-4 shrink-0 text-gray-500" />
                {/* 규격은 자료 관리 패널(MaterialPanel)의 행과 동일하게 맞춘다 — 등록 모드와
                    조회 모드에서 같은 목록이 다르게 보이면 안 된다. */}
                <span className={`min-w-0 flex-1 truncate ${tableText.primary}`}>{file.name}</span>
                <span className={`shrink-0 tabular-nums ${tableText.meta}`}>
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
        ) : links.length === 0 ? (
          // 링크만 담겨 있으면 빈 상태가 아니다 — 위에 이미 목록이 서 있는데 그 아래에
          // '없습니다'가 함께 서면 화면이 스스로를 부정한다.
          <p className="text-body text-gray-600">첨부한 자료가 없습니다.</p>
        ) : null}
      </div>
    </DetailPanelCard>
  )
}
