/**
 * **실제 GUEST 계정 창들**을 그대로 세우는 자리.
 *
 * 세우는 것은 셋이고 전부 `Modal size="3xl"` 한 벌을 쓴다 — `GUEST 계정 추가`(참가자 명부),
 * `GUEST 계정 생성`(줄 격자), 그리고 둘의 조판 기준선인 `데이터베이스(NETWORKS)에서
 * 불러오기`. 같은 폭·같은 조판이 세 창에서 같은 결과로 서는지가 이 줄들이 답하는 물음이다.
 *
 * 부품을 다시 조립하지 않는다. 통신·세션을 무는 모듈만 Vite 플러그인이 대역으로 바꾸고
 * (`vite.config.mjs`의 `MOCKS`), 나머지는 앱이 쓰는 그 파일이다. 창을 여는 동작도 여기서
 * 심지 않고 러너가 눌러서 만든다 — `open`만 참으로 세운다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ParticipantAddModal } from '@works/features/program/ParticipantAddModal'
import { GuestAccountCreateModal } from '@works/features/guest/GuestAccountCreateModal'
import { LedgerCandidatePickerModal } from '@works/features/guest/LedgerCandidatePickerModal'

/**
 * `GuestAccountCreateModal`은 `useQueryClient`로 목록 무효화를 걸고, 대용량 페이지 머리에
 * `Link`를 세운다. 둘 다 Provider 밖에서 부르면 그 자리에서 던지므로 실제 앱과 같은 껍데기를
 * 두른다. 재시도는 끈다 — 대역이 던지는 순간을 화면이 조용히 세 번 더 기다리면 안 된다.
 */
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

function Shell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/guest-accounts/bulk']}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

/** 화면이 읽는 칸은 워크스페이스 권한 판정뿐이고, 그 판정은 `authStore` 대역이 답한다. */
const USER = { id: 'usr-works-1', name: '박담당', role: 'ADMIN' }

export function ParticipantAddCase() {
  return (
    <Shell>
      <ParticipantAddModal open onClose={() => {}} programId="prg-1" />
    </Shell>
  )
}

export function GuestCreateCase() {
  return (
    <Shell>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <GuestAccountCreateModal open onClose={() => {}} user={USER as any} />
    </Shell>
  )
}

export function GuestBulkCase() {
  return (
    <Shell>
      <div className="min-w-0 p-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <GuestAccountCreateModal open onClose={() => {}} user={USER as any} presentation="bulk-page" />
      </div>
    </Shell>
  )
}

export function LedgerPickerCase() {
  return (
    <Shell>
      <LedgerCandidatePickerModal open initialKeyword="" onPickMany={() => {}} onClose={() => {}} />
    </Shell>
  )
}
