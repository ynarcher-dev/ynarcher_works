import { cn } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import type { Branch } from '@/features/office/branches/branchesApi'

interface Props {
  branches: Branch[]
  selectedId?: string
  onSelect: (id: string) => void
}

/**
 * ADMIN 회의실 관리의 지사 선택 바(선택 전용).
 * 지사 원장(지사명·주소·전화번호·배정인력)의 추가·수정은 ADMIN '지사 관리'가 단독으로 소유한다 —
 * 두 화면에서 지사를 만들 수 있으면 같은 지사가 중복 등록되므로 여기서는 고르기만 한다.
 */
export function MeetingBranchBar({ branches, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {branches.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onSelect(b.id)}
          className={cn(
            'rounded-radius-full border px-3 py-1.5 text-body font-medium transition-colors',
            b.id === selectedId
              ? 'border-brand bg-brand/10 text-brand'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            !b.isActive && 'opacity-60',
          )}
        >
          {b.name}
          {!b.isActive && <span className="ml-1 text-caption text-gray-400">(비활성)</span>}
        </button>
      ))}

      {branches.length === 0 ? (
        <p className="text-body text-gray-500">
          등록된 지사가 없습니다.{' '}
          <Link to="/admin?tab=branches" className="text-brand underline">
            지사 관리
          </Link>
          에서 먼저 지사를 추가하세요.
        </p>
      ) : (
        <Link to="/admin?tab=branches" className="ml-1 text-caption text-gray-500 underline">
          지사 관리
        </Link>
      )}
    </div>
  )
}
