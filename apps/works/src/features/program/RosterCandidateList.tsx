import { Field, Input, PickList, PickMark, PickRow, Spinner } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import type { MasterCandidate } from '@/features/program/participantHooks'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'

/**
 * 원장에서 담을 대상을 고르는 목록 — `RosterAddModal`의 '고르기' 모드 본문.
 *
 * 모달에서 떼어낸 이유는 재사용이 아니라 **한 파일이 두 모드를 함께 지고 있었기** 때문이다.
 * 고르기와 새로 만들기는 같은 창에 살지만 서로의 값을 모르며, 모달에 남는 것은 둘 사이를
 * 오가는 일과 저장 흐름뿐이어야 한다.
 *
 * 후보 목록의 규격은 GUEST 명부·회의록 외부 참석자 검색과 같다(체크 원 + 이름·메타 두 줄 +
 * 행 전체 클릭) — 원장에서 골라 담는 화면이 앱 안에서 서로 다르게 생길 이유가 없다.
 */
export function RosterCandidateList({
  master,
  candidates,
  isLoading,
  search,
  onSearchChange,
  picked,
  onToggle,
}: {
  master: MasterTable
  candidates: MasterCandidate[]
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  picked: string[]
  onToggle: (id: string) => void
}) {
  const spec = PARTICIPANT_PERSONAS[master]

  return (
    <div className="space-y-4">
      <Field label="검색">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={spec.pickSearchPlaceholder}
        />
      </Field>

      <div className="overflow-hidden rounded-radius-md border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <PickList isEmpty={candidates.length === 0} empty="검색 결과가 없습니다.">
            {candidates.map((c) => {
              const added = picked.includes(c.id)
              return (
                <PickRow
                  key={c.id}
                  selected={added}
                  disabled={c.alreadyMapped}
                  onClick={() => onToggle(c.id)}
                >
                  <PickMark checked={added}>
                    <Check className="size-3.5" />
                  </PickMark>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-gray-900">
                      <span className="font-medium">{c.name}</span>
                      {c.loginName && <span className="text-gray-500"> · {c.loginName}</span>}
                    </span>
                    <span className="block truncate text-body-sm text-gray-600">
                      {c.email ?? c.phone ?? '원장에 연락처 없음'}
                    </span>
                  </span>
                  {c.alreadyMapped && (
                    <span className="shrink-0 text-body-sm text-gray-500">담김</span>
                  )}
                </PickRow>
              )
            })}
          </PickList>
        )}
      </div>
    </div>
  )
}
