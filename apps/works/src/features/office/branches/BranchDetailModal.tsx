import { Badge, Button, InfoField, Modal } from '@ynarcher/ui'
import type { Branch } from '@/features/office/branches/branchesApi'

interface Props {
  /** 열람 대상 지사(없으면 닫힌 상태). */
  branch: Branch | null
  /** 해당 지사의 배정인력 이름(배정 순서 유지). */
  memberNames: string[]
  /** 목록에서의 위치(1-base)와 전체 건수 — 순차 이동 표기용. */
  index: number
  total: number
  onClose: () => void
  /** 목록 순서대로 앞/뒤 지사로 이동. 끝에서는 undefined. */
  onPrev?: () => void
  onNext?: () => void
}

/**
 * OFFICE 지사 상세 모달(조회 전용). 목록 표는 지사명·주소·전화번호만 보여주고,
 * 배정인력을 포함한 전체 항목은 여기서 순서대로 확인한다.
 * 원장 수정은 ADMIN '지사 관리'가 소유하므로 이 모달은 편집 수단을 두지 않는다.
 */
export function BranchDetailModal({
  branch,
  memberNames,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: Props) {
  if (!branch) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={branch.name}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-caption text-gray-500">
            {index} / {total}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onPrev} disabled={!onPrev}>
              이전
            </Button>
            <Button variant="ghost" onClick={onNext} disabled={!onNext}>
              다음
            </Button>
            <Button onClick={onClose}>닫기</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2.5">
        <InfoField label="지사명" value={branch.name} />
        <InfoField label="주소" value={branch.address} />
        <InfoField label="전화번호" value={branch.phone} />
        <InfoField
          label="배정인력"
          value={
            memberNames.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {memberNames.map((n) => (
                  <Badge key={n}>{n}</Badge>
                ))}
              </span>
            ) : null
          }
        />
      </div>
    </Modal>
  )
}
