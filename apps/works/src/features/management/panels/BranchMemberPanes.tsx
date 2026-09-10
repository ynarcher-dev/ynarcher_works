import {
  DataTable,
  Field,
  Input,
  PickLine,
  PickList,
  PickMark,
  PickRow,
  Spinner,
  TransferPanes,
} from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { branchMemberOrgLabel, useEmployeeOrgEntries } from '@/features/office/branches/branchMembers'
import {
  BRANCH_MEMBER_COLUMNS,
  toBranchMemberRow,
  type BranchMemberRow,
} from '@/features/office/branches/branchMemberTable'


/**
 * 지사 수정 창의 **상주인력 두 기둥** — 왼쪽은 임직원 원장, 오른쪽은 이 지사에 상주하는 사람이다.
 *
 * 종전에는 입력 칸 안에 이름 칩이 쌓이는 토큰 선택기였다. 칩은 **지금 무엇을 골랐는가**만 답하고
 * 그 사람이 어느 조직인지는 말하지 못하는데, 지사에 누구를 앉힐지는 대개 조직을 보고 정한다.
 * 그 조직은 담긴 기둥의 **표**가 자기 열로 세우며, 열 한 벌은 OFFICE 상세와 함께 쓴다
 * (`branchMemberTable`).
 *
 * 골격은 명단 담기·계정 생성 창과 **같은 부품**(`TransferPanes`)이다 — 담당자가 하는 손놀림이
 * 같으므로(왼쪽에서 체크하고 가운데로 옮기고 오른쪽을 확인한 뒤 저장한다) 창마다 다르게 생길
 * 이유가 없다.
 *
 * **확정 전에는 아무 일도 일어나지 않는다** — 옮기는 동안 원장이 바뀌면 잘못 눌렀다는 것을
 * 알아차렸을 때 이미 되돌릴 수 없다. 이 부품은 값과 그 값을 바꾸는 방법만 갖고, 저장은 창이 한다.
 */
export function BranchMemberPanes({
  value,
  onChange,
}: {
  /** 이 지사의 상주인력(user_id). 순서는 담은 순서다. */
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { entryOf, entries, isLoading } = useEmployeeOrgEntries()
  const [search, setSearch] = useState('')
  const [checkedLeft, setCheckedLeft] = useState<string[]>([])
  const [checkedRight, setCheckedRight] = useState<string[]>([])

  const selected = useMemo(() => new Set(value), [value])

  /**
   * 왼쪽 — 아직 안 담긴 임직원 중 검색어에 걸리는 줄.
   *
   * 견주는 값은 그 줄이 실제로 보여 주는 것뿐이다(이름과 조직 경로). 화면에 없는 값으로 걸러지면
   * 담당자는 왜 그 줄이 남았는지 답할 근거가 없다.
   */
  const left = useMemo(() => {
    const term = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (selected.has(e.id)) return false
      if (!term) return true
      return `${e.name} ${branchMemberOrgLabel(e)}`.toLowerCase().includes(term)
    })
  }, [entries, selected, search])

  /**
   * 오른쪽 — 담긴 사람. **검색어를 따르지 않는다**(좌우로 가른 이유가 이 목록을 눈에 두는 것이다).
   * 이름을 못 읽는 계정도 줄을 세운다 — 감추면 담당자가 모르는 사이에 저장이 그 사람을 지운다.
   */
  const right = useMemo<BranchMemberRow[]>(
    () => value.map((id) => toBranchMemberRow(id, entryOf(id))),
    [value, entryOf],
  )

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((v) => v !== id) : [...list, id])

  const move = (ids: string[], toRight: boolean) => {
    if (ids.length === 0) return
    // 옮긴 줄의 체크는 푼다 — 남겨 두면 가운데 버튼의 건수가 이미 옮긴 줄까지 세어 거짓을 말한다.
    if (toRight) {
      const add = ids.filter((id) => !selected.has(id))
      onChange([...value, ...add])
      setCheckedLeft([])
    } else {
      const drop = new Set(ids)
      onChange(value.filter((id) => !drop.has(id)))
      setCheckedRight([])
    }
  }

  return (
    <TransferPanes
      left={{
        title: '임직원 원장',
        count: left.length,
        children: (
          <div className="space-y-3">
            <Field label="검색">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름·조직 검색"
              />
            </Field>
            <div className="overflow-hidden rounded-radius-md border border-gray-200">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner />
                </div>
              ) : (
                <PickList
                  isEmpty={left.length === 0}
                  empty={
                    search.trim() ? '검색 결과가 없습니다.' : '더 담을 임직원이 없습니다.'
                  }
                >
                  {left.map((e) => {
                    const on = checkedLeft.includes(e.id)
                    return (
                      <PickRow
                        key={e.id}
                        selected={on}
                        onClick={() => toggle(checkedLeft, setCheckedLeft, e.id)}
                      >
                        <PickMark checked={on}>
                          <Check className="size-3" />
                        </PickMark>
                        <PickLine name={e.name} />
                      </PickRow>
                    )
                  })}
                </PickList>
              )}
            </div>
          </div>
        ),
      }}
      right={{
        title: '이 지사 상주인력',
        count: right.length,
        children: (
          /*
            담긴 기둥은 표다(계정 생성·명단 담기 창과 같은 규격) — 값을 이어 붙이면 빈 값이
            사라져 무엇이 비었는지 말하지 못한다. 여기서 비는 것은 조직 배치이고, 그것은
            지사에 앉힐 사람을 고르는 근거라 눈에 띄어야 한다.
          */
          <DataTable
            columns={BRANCH_MEMBER_COLUMNS}
            rows={right}
            rowKey={(row) => row.entry.id}
            numbered={false}
            standardColumns={false}
            selectable
            selectedKeys={checkedRight}
            onSelectionChange={setCheckedRight}
            emptyText="왼쪽에서 임직원을 고르고 [넣기]를 누르세요."
          />
        ),
      }}
      toRight={{
        count: checkedLeft.length,
        onMove: () => move(checkedLeft, true),
        // '전체'는 보이는 줄 전부다 — 검색으로 좁힌 결과만 넘어간다.
        onMoveAll: () => move(left.map((e) => e.id), true),
        allDisabled: left.length === 0,
      }}
      toLeft={{
        count: checkedRight.length,
        onMove: () => move(checkedRight, false),
        onMoveAll: () => move(right.map((r) => r.entry.id), false),
        allDisabled: right.length === 0,
      }}
    />
  )
}
