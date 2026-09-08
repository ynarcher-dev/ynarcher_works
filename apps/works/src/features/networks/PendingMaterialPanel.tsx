import { IconButton, panelRowBox, tableText } from '@ynarcher/ui'
import { File as FileIcon, Link as LinkIcon, Trash2 } from 'lucide-react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialLinkInput } from '@/features/networks/MaterialLinkInput'
import { formatBytes, type Material } from '@/features/networks/materialHooks'
import { MaterialRefGroups } from '@/features/networks/MaterialRefGroups'
import type { PendingMaterials } from '@/features/networks/pendingMaterials'

/**
 * 신규 등록 폼용 자료 패널. 대상 레코드가 아직 없으므로 파일을 즉시 업로드하지 않고
 * 보류 목록(`PendingMaterials`)에 담아 두며, 등록 저장 직후 일괄 업로드된다.
 * 조작감(드롭존·목록·삭제)은 상세 수정 폼의 `MaterialPanel`과 동일하게 맞춘다.
 *
 * **참조 자료(`refs`)는 등록 화면에서도 선다**(2026-09-08). 여기가 참조가 가장 필요한 자리다 —
 * 스타트업 원장에서 기업을 끌어와 셀러를 만들고 그 자리에서 초안까지 만드는 것이 정상 순서인데,
 * 참조가 저장 후에야 보이면 담당자는 같은 파일을 한 번 더 올린다. 이 자료들은 보류 목록과 달리
 * **이미 원장에 있는 행**이라 저장 시 함께 올라가지 않는다(복제하지 않는 것이 참조의 요점이다).
 */
export function PendingMaterialPanel({
  slot,
  pending,
  refs = [],
  title = '자료 관리',
}: {
  /** 자료 분류 키(= 업로드 시 target_type). */
  slot: string
  pending: PendingMaterials
  /** 폼에서 방금 고른 연결이 데려온 다른 대상의 자료(읽기 전용, 저장 대상 아님). */
  refs?: Material[]
  title?: string
}) {
  const list = pending.files(slot)
  const links = pending.links(slot)

  return (
    <DetailPanelCard
      title={title}
      count={list.length + links.length + refs.length}
      help="첨부한 자료는 등록을 저장할 때 함께 업로드됩니다. 연결한 원장의 자료는 참조로 함께 보이며 복제되지 않습니다."
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
        ) : links.length === 0 && refs.length === 0 ? (
          // 링크나 참조가 이미 서 있으면 빈 상태가 아니다 — 위에 목록이 있는데 그 아래에
          // '없습니다'가 함께 서면 화면이 스스로를 부정한다.
          <p className="text-body text-gray-600">첨부한 자료가 없습니다.</p>
        ) : null}
      </div>

      {/* 참조 자료 — 수정 모드 패널과 같은 부품이라 저장 전후로 생김새가 달라지지 않는다. */}
      <MaterialRefGroups refs={refs} />
    </DetailPanelCard>
  )
}
