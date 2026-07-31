import { Button, Input, Select, TokenMultiSelect, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useEmployees } from '@/features/management/hooks'
import {
  CREATOR_LEDGERS,
  useCreatorTargets,
  useSetEntityCreator,
  type CreatorLedger,
  type CreatorTargetRow,
} from '@/features/admin/creatorTransfer'

/** TokenMultiSelect(칩이 입력 필드 안에 남는 선택기)용 임직원 최소 형태. */
type PersonOpt = { id: string; name: string | null; email: string | null }

/** 셀렉트 optgroup 순서(사이드바 구획과 같은 순서). */
const GROUPS: CreatorLedger['group'][] = ['데이터베이스', '워크스페이스']

/**
 * ADMIN 생성자 교체: 원장을 고르고 레코드를 찾아 생성자(created_by)를 다른 임직원으로 바꾼다.
 *
 * 생성자는 권한 축이 아니다 — 어느 원장도 created_by 로 수정 권한을 주지 않는다(관리 주체는 담당자).
 * 다만 '내 ~ 관리' 목록의 소속과 최초 생성 책임 표기가 생성자를 따라가므로, 퇴사·조직 이동·오등록을
 * 정리할 관리자 경로로 둔다. 실제 판정(관리자 여부·허용 원장·계정 유효성)은 모두 서버 RPC가 한다.
 */
export function CreatorTransferPanel() {
  const toast = useToast()
  const [table, setTable] = useState(CREATOR_LEDGERS[0]!.table)
  const [keyword, setKeyword] = useState('')
  const [targetId, setTargetId] = useState('')
  const [newCreator, setNewCreator] = useState<string>('')
  const [reason, setReason] = useState('')

  const ledger = CREATOR_LEDGERS.find((l) => l.table === table) ?? CREATOR_LEDGERS[0]!
  const { data: rows, isFetching } = useCreatorTargets(ledger, keyword)
  const { data: employees } = useEmployees()
  const transfer = useSetEntityCreator()

  const people: PersonOpt[] = useMemo(
    () => (employees ?? []).map((e) => ({ id: e.id, name: e.name, email: e.email })),
    [employees],
  )
  const nameOf = (id: string | null): string =>
    (id && people.find((p) => p.id === id)?.name) || (id ? '알 수 없음' : '미지정')
  const personObj = (id: string): PersonOpt =>
    people.find((p) => p.id === id) ?? { id, name: nameOf(id), email: null }

  const target: CreatorTargetRow | null = (rows ?? []).find((r) => r.id === targetId) ?? null

  // 원장을 바꾸면 검색·선택을 처음 상태로 되돌린다(다른 원장의 선택이 남아 있으면 오조작이 된다).
  const pickLedger = (next: string) => {
    setTable(next)
    setKeyword('')
    setTargetId('')
  }

  const submit = async () => {
    if (!target) {
      toast.show('교체할 레코드를 선택하세요.', 'warning')
      return
    }
    if (!newCreator) {
      toast.show('새 생성자를 선택하세요.', 'warning')
      return
    }
    if (newCreator === target.created_by) {
      toast.show('이미 그 사람이 생성자입니다.', 'warning')
      return
    }
    try {
      await transfer.mutateAsync({ table: ledger.table, id: target.id, userId: newCreator, reason })
      toast.show(`생성자를 ${nameOf(newCreator)}(으)로 교체했습니다.`, 'success')
      setNewCreator('')
      setReason('')
    } catch {
      toast.show('교체에 실패했습니다. 관리자 권한과 대상 원장을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-body text-gray-600">
        생성자는 수정·삭제 권한을 주지 않는 표기 축입니다(관리 주체는 담당자). 교체하면 그 레코드가
        이전 생성자의 &lsquo;내 ~ 관리&rsquo; 목록에서 빠지고 새 생성자의 목록에 나타나며, 변경 이력은
        감사 로그와 원장 변동 이력에 함께 남습니다.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="creator-ledger">
            대상 원장
          </label>
          <Select id="creator-ledger" value={table} onChange={(e) => pickLedger(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {CREATOR_LEDGERS.filter((l) => l.group === g).map((l) => (
                  <option key={l.table} value={l.table}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="creator-keyword">
            레코드 검색
          </label>
          <Input
            id="creator-keyword"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setTargetId('')
            }}
            placeholder={ledger.nameColumn === 'title' ? '사업명으로 검색' : '이름으로 검색'}
          />
        </div>
      </div>

      {/* 검색 결과: 이름 + 현재 생성자. 행을 눌러 대상을 고정한다. */}
      {keyword.trim() !== '' && (
        <div className="rounded-radius-md border border-gray-200">
          {isFetching && (rows ?? []).length === 0 ? (
            <p className="px-3 py-4 text-body-sm text-gray-500">불러오는 중…</p>
          ) : (rows ?? []).length === 0 ? (
            <p className="px-3 py-4 text-body-sm text-gray-500">일치하는 레코드가 없습니다.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
              {(rows ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(r.id)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-fast ${
                      r.id === targetId ? 'bg-brand-25' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-gray-900">{r.name}</span>
                    <span className="shrink-0 text-body-sm text-gray-500">
                      생성자 {nameOf(r.created_by)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-body font-medium text-gray-800">새 생성자</label>
          <TokenMultiSelect<PersonOpt>
            selected={newCreator ? [personObj(newCreator)] : []}
            onChange={(next) => setNewCreator(next.at(-1)?.id ?? '')}
            options={people}
            getKey={(e) => e.id}
            getLabel={(e) => e.name ?? '(이름 없음)'}
            getMeta={(e) => e.email ?? undefined}
            getSearchText={(e) => `${e.name ?? ''} ${e.email ?? ''}`}
            max={1}
            placeholder="임직원 검색"
          />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="creator-reason">
            사유
          </label>
          <Input
            id="creator-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 담당 조직 이관 / 퇴사자 정리"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="text-body-sm text-gray-600">
          {target
            ? `${ledger.label} · ${target.name} — 현재 생성자 ${nameOf(target.created_by)}`
            : '교체할 레코드를 검색해 선택하세요.'}
        </p>
        <Button onClick={() => void submit()} disabled={!target || transfer.isPending}>
          생성자 교체
        </Button>
      </div>
    </div>
  )
}
