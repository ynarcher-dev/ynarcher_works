import {
  Field,
  Input,
  MiniPager,
  PickLine,
  PickList,
  PickMark,
  PickRow,
  Spinner,
  TransferPanes,
} from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useGuestHost } from '@/features/guest/host'
import { ParticipantRightTable } from '@/features/program/ParticipantRightTable'
import type { useParticipantTransfer } from '@/features/program/participantTransfer'

/**
 * `GUEST 계정 추가` 창의 두 기둥 — **왼쪽은 이 사업 밖의 GUEST 계정, 오른쪽은 이 사업의
 * GUEST 명부**다.
 *
 * 축이 '계정 없음 / 계정 있음'이던 자리다(2026-09-13에 바꿈). 그때는 이 창이 계정을 세우는
 * 자리라 그 축이 곧 하는 일이었지만, 지금은 세우지 않으므로 두 기둥이 답하는 물음이
 * **"이 사업에 있는가"** 하나로 바뀌었다.
 *
 * **왼쪽 목록은 서버가 검색하고 서버가 페이징한다.** 계정은 전사 규모라 한 번에 받아 화면에서
 * 거르면 첫 페이지 안에서만 검색이 걸린다. 그래서 검색칸과 페이저가 이 기둥 안에 함께 선다 —
 * 오른쪽 표는 이 사업의 명부라 수십 건이고, 같은 검색어에 걸리지 않는다.
 */
export function ParticipantTransferPanes({
  search,
  onSearchChange,
  page,
  pageCount,
  onPageChange,
  total,
  isLoading,
  isError,
  busy,
  addIssues,
  transfer,
}: {
  search: string
  onSearchChange: (v: string) => void
  /** 0-base. 서버 페이징이라 화면이 들고 훅에 그대로 넘긴다. */
  page: number
  pageCount: number
  onPageChange: (next: number) => void
  /** 검색어를 반영한 전체 후보 수(서버가 센다). */
  total: number
  isLoading: boolean
  isError: boolean
  /** 저장 중에는 화면의 대기 목록을 바꾸지 않는다. */
  busy: boolean
  /** 직전 저장에서 계정별로 받은 실패 또는 결과 미확인 사유. */
  addIssues: Readonly<Record<string, string>>
  transfer: ReturnType<typeof useParticipantTransfer>
}) {
  const { entityNoun } = useGuestHost()
  const { left, right } = transfer

  return (
    <TransferPanes
      left={{
        title: 'GUEST 계정',
        count: left.length,
        children: (
          <div className="space-y-2">
            <Field label="검색">
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="계정명 · 이메일 · 연락처"
                disabled={busy}
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
                  /*
                    셋을 가른다. 조회 실패는 "없다"가 아니고, 검색 결과 없음과 후보 소진은
                    담당자가 할 일이 정반대다(검색어를 고치는 일 / 계정을 먼저 만드는 일).
                  */
                  empty={
                    isError
                      ? 'GUEST 계정 목록을 불러오지 못했습니다.'
                      : search.trim()
                        ? '검색 결과가 없습니다. 계정 생성은 통합 GUEST 계정 관리에서 합니다.'
                        : '더 고를 수 있는 GUEST 계정이 없습니다. 계정 생성은 통합 GUEST 계정 관리에서 합니다.'
                  }
                >
                  {left.map((row) => {
                    const on = transfer.checkedLeft.includes(row.key)
                    return (
                      <PickRow
                        key={row.key}
                        selected={on}
                        disabled={busy}
                        onClick={() => transfer.toggleLeft(row.key)}
                      >
                        <PickMark checked={on}>
                          <Check className="size-3" />
                        </PickMark>
                        {/* 왼쪽에서 하는 일은 이름으로 찾아 고르는 것뿐이다 — 계정의 값은
                            옮기고 나서 오른쪽 기둥의 표가 답한다(`PickLine` 주석). */}
                        <PickLine name={row.name} />
                        {row.kind === 'returning' && (
                          // 내린 줄은 **확정하면 지워진다**. 그 사실을 좌측에서 말하지 않으면
                          // '아직 안 담은 것'과 생김새가 같아, 되돌리려는 손이 그 줄을 못 찾는다.
                          <span className="shrink-0 text-body-sm text-danger">뺌</span>
                        )}
                        {row.kind === 'candidate' && !row.candidate.isActive && (
                          <span className="shrink-0 text-body-sm text-danger">정지</span>
                        )}
                      </PickRow>
                    )
                  })}
                </PickList>
              )}
            </div>

            {/*
              전체 건수는 **서버가 센 수**다(이 페이지에 보이는 줄 수가 아니다). 기둥 제목의
              건수와 갈리는데, 그 둘은 서로 다른 물음의 답이다 — 제목은 '지금 보이는 것',
              여기는 '검색어에 걸린 전부'.

              페이지를 넘겨도 체크는 남는다(되돌아오면 그대로다) — 다만 가운데 버튼의 건수는
              지금 보이는 줄만 센다.
            */}
            <p className="text-center text-caption text-gray-600">검색 결과 {total}건</p>
            <MiniPager page={page} pageCount={pageCount} onPage={onPageChange} />
          </div>
        ),
      }}
      right={{
        title: `이 ${entityNoun}의 GUEST 명부`,
        count: right.length,
        children: (
          <ParticipantRightTable
            rows={right}
            checked={transfer.checkedRight}
            onCheckedChange={transfer.setCheckedRight}
            disabled={busy}
            issues={addIssues}
          />
        ),
      }}
      toRight={{
        count: busy ? 0 : transfer.checkedLeft.length,
        onMove: transfer.moveRight,
        onMoveAll: transfer.moveAllRight,
        allDisabled: busy || left.length === 0,
      }}
      toLeft={{
        count: busy ? 0 : transfer.checkedRight.length,
        onMove: transfer.moveLeft,
        onMoveAll: transfer.moveAllLeft,
        allDisabled: busy || right.length === 0,
      }}
    />
  )
}
