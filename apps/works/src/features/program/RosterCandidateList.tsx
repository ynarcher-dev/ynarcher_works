import { Field, Input, PickLine, PickList, PickMark, PickRow, Spinner } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import type { MasterCandidate } from '@/features/program/participantHooks'
import { gapText, ledgerGaps } from '@/features/program/participantPerson'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'

/**
 * 원장에서 담을 대상을 고르는 목록 — 담기 창의 **왼쪽 기둥** 본문(검색칸 + 후보 줄).
 *
 * 모달에서 떼어낸 이유는 재사용이 아니라 **한 파일이 두 모드를 함께 지고 있었기** 때문이다.
 * 고르기와 새로 만들기는 같은 창에 살지만 서로의 값을 모르며, 모달에 남는 것은 둘 사이를
 * 오가는 일과 저장 흐름뿐이어야 한다.
 *
 * **여기서 체크하는 것은 담기가 아니라 옮길 줄이다**(2026-09-10). 종전에는 이 목록의 체크가
 * 곧 저장 대상이라, 검색어를 바꾸면 방금 고른 줄이 목록 밖으로 사라져 담당자가 자기 선택을
 * 저장 버튼의 숫자로만 알 수 있었다. 지금은 체크한 줄을 가운데 버튼으로 오른쪽 기둥에
 * 올리고, 그 기둥이 검색어와 무관하게 서 있다.
 *
 * 후보 줄의 규격은 GUEST 명부·회의록 외부 참석자 검색과 같다(체크 표식 + 이름·메타 두 줄 +
 * 행 전체 클릭) — 원장에서 골라 담는 화면이 앱 안에서 서로 다르게 생길 이유가 없다.
 */
export function RosterCandidateList({
  master,
  candidates,
  isLoading,
  search,
  onSearchChange,
  checked,
  onToggle,
}: {
  master: MasterTable
  candidates: MasterCandidate[]
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  /** 지금 체크된 줄. 오른쪽으로 옮기면 비워진다. */
  checked: string[]
  onToggle: (id: string) => void
}) {
  const spec = PARTICIPANT_PERSONAS[master]

  return (
    <div className="space-y-3">
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
              const on = checked.includes(c.id)
              // 원장이 비워 둔 칸은 **막는 것이 아니라 알린다**(2026-09-10 사용자 지정).
              // 담긴 것은 계정을 열 수 있어야 하므로 그 값들은 반드시 채워지지만, 채우는 자리는
              // 오른쪽 기둥이다 — 여기서 막으면 담당자가 명단을 꾸리다 말고 원장 화면으로 나갔다
              // 돌아와야 하고, 창을 떠나는 순간 지금까지 고른 것이 사라진다.
              const gap = gapText(ledgerGaps(c), spec.loginNameHeader)
              return (
                <PickRow
                  key={c.id}
                  selected={on}
                  disabled={c.alreadyMapped}
                  title={gap ? `원장에 ${gap}. 담으면서 오른쪽 표에서 채울 수 있습니다.` : undefined}
                  onClick={() => onToggle(c.id)}
                >
                  <PickMark checked={on}>
                    <Check className="size-3" />
                  </PickMark>
                  {/* 왼쪽에서 하는 일은 이름으로 찾아 고르는 것뿐이다 — 명의·연락처는 담고
                      나서 오른쪽 기둥이 답한다(`PickLine` 주석). */}
                  <PickLine name={c.name} />
                  {/*
                    왜 못 고르는지는 접지 않는다(차단 안내 — CLAUDE.md 안내 규칙의 예외).
                    빈 칸 표시는 차단이 아니라 **담고 나서 할 일**이라 붉게 적지 않는다 — 색은
                    상태에만 쓰고, 여기서 danger를 쓰면 못 담는 줄로 읽힌다.
                  */}
                  {c.alreadyMapped ? (
                    <span className="shrink-0 text-body-sm text-gray-500">담김</span>
                  ) : (
                    gap && <span className="shrink-0 text-body-sm text-warning">{gap}</span>
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
