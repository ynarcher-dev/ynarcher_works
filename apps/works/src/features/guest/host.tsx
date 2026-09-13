import { createContext, useContext, type ReactNode } from 'react'
import type { MasterTable } from '@/features/program/participantPersona'

/**
 * **게스트에게 무엇이 나가는가**를 다루는 화면들이 공유하는 최소 설정.
 *
 * 2026-09-09에 FUND가 게스트 맥락으로 들어오면서 생긴 축이다. 그때까지 개요·공지·Q&A·계정
 * 화면은 `ProgramWorkspaceConfig`(사업 워크스페이스 설정) 전체를 읽고 있었는데, 조합은
 * 사업이 아니라 그 설정의 대부분(사업구분·제안 단계·주관·인력 배치 RPC)을 답할 수 없다.
 * 값을 지어내 채우면 그 config는 **거짓을 말하는 설정**이 된다.
 *
 * 그래서 갈랐다 — 이 화면들이 실제로 묻는 것은 다섯뿐이다: 어느 워크스페이스인가(캐시 키),
 * 통합 원장에서 이 행의 소속은 무엇인가, 게스트에게 나가는 소개문을 뭐라 부르는가,
 * 계정을 세울 수 있는 자격은 무엇인가, 그 계정 후보를 어디서 고르는가.
 *
 * `ProgramWorkspaceConfig`가 이 인터페이스를 상속하므로 사업 워크스페이스는 자기 설정을
 * 그대로 넘기고, FUND는 이 다섯 칸만 채운 설정 하나를 세운다.
 */
export type GuestHostKey = 'project' | 'mna' | 'fund'

/** 통합 원장(참여 줄·개요·공지·Q&A)에서 소속을 답하는 값. DB의 CHECK와 한 벌로 움직인다. */
export type GuestEntityKey = 'program' | 'ma_program' | 'fund'

/**
 * 계정 후보를 고르는 자리 — **그 사업·조합이 "누구를 들일지" 이미 정해 둔 목록**.
 *
 * 계정은 "누구를 들일지 정한 다음"에 세우는 것이므로 원장 전체에서 곧바로 고르지 않는다
 * (2026-09-09에 좁힌 규칙). 그 결정이 사는 곳이 워크스페이스마다 다르다.
 *
 *  · `entries` — 담당자가 따로 꾸리는 참가자 목록(`program_participant_entries`).
 *  · `table`  — 이미 그 사실을 답하고 있는 업무 원장을 그대로 명단으로 읽는다.
 *    FUND가 여기다: `investments`가 "이 조합이 누구에게 투자했는가"를 이미 답하므로,
 *    같은 사실을 적는 명단 표를 하나 더 두면 어긋날 자리만 는다.
 */
export type GuestRosterSource =
  | { kind: 'entries' }
  | {
      kind: 'table'
      /** 명단으로 읽을 표. */
      table: string
      /** 그 표에서 사업·조합을 가리키는 칸. */
      parentColumn: string
      /** 그 표에서 원장 행을 가리키는 칸. */
      idColumn: string
      /** 이 표가 담는 자격 하나. 표가 한 자격만 담기 때문에 값으로 든다. */
      master: MasterTable
      /** 소프트 삭제 칸(있으면 살아 있는 줄만 읽는다). */
      deletedColumn?: string
    }

export interface GuestHostConfig {
  /** react-query 캐시 키의 앞머리이자 이 화면이 선 자리. */
  key: GuestHostKey
  /** 현재 대상 한 건을 화면에서 부르는 이름. PROJECT는 프로젝트, M&A는 M&A 프로젝트, FUND는 FUND다. */
  entityNoun: string
  /**
   * 통합 원장에서 이 행의 소속을 답하는 값.
   *
   * 원장을 합치고 행마다 이 값이 소속을 지게 한 것이 2026-09-03이며, 그래서 **사업으로
   * 좁히지 않는 조회에는 반드시 이 값을 함께 건다.**
   */
  entityKey: GuestEntityKey
  /**
   * 게스트에게 나가는 소개문의 이름(GUEST 설정 모달의 첫 탭·카드 제목·작성 모달 제목).
   *
   * 규칙으로 짓지 못하는 말이라 값이다 — PROJECT는 '프로젝트 개요', M&A는
   * 'M&A 프로젝트 개요', FUND는 '조합 개요'다.
   */
  overviewNoun: string
  /**
   * 참가자 명단이 스스로를 부르는 이름(추가 모달 안내·빈 상태가 함께 읽는다).
   * PROJECT는 '참가자 목록', M&A는 '딜 참여사', FUND는 '포트폴리오'다.
   */
  rosterLabel: string
  /**
   * 이 워크스페이스가 다루는 **인격의 출처 원장**(2026-09-08).
   *
   * 계정생성 창구의 하위 탭과 명부의 자격 탭이 **같은 이 값**을 편다 — 계정을 세울 수 있는
   * 자격과 명부에 담을 수 있는 자격이 갈리면, 발급은 되는데 어디에도 담기지 않는 계정이
   * 생기고 화면은 그 이유를 답하지 못한다.
   *
   * 창구가 없는 워크스페이스에는 두지 않는다(`undefined`). 값을 비워 두는 것과 창구가
   * 없는 것은 같은 뜻이며, 창구를 열 때 이 값을 함께 정하는 것이 순서다.
   */
  guestMasterTables?: readonly MasterTable[]
  /** 계정 후보를 고르는 자리. */
  rosterSource: GuestRosterSource
}

/**
 * 게스트 설정 화면들이 다루는 **대상 한 줄**(사업 또는 조합).
 *
 * 사업 원장의 `Program` 전체를 받지 않는 이유는 이 화면들이 쓰는 것이 아래 넷뿐이기 때문이다.
 * 전체를 받으면 조합이 답할 수 없는 칸(사업구분·제안 단계)까지 형태에 실려, 조합 쪽에서
 * 그 칸들을 억지로 채우거나 타입을 느슨하게 풀게 된다.
 *
 * `title`은 화면이 부르는 이름이며 원장의 칸 이름이 아니다 — 조합의 제목은 `name`이고,
 * 맞추는 일은 그 원장을 읽는 훅이 끝낸다.
 */
export interface GuestHostEntity {
  id: string
  title: string
  /** 진행 상태. 문이 열려 있어도 끝난 대상에는 들어올 수 없다는 판정에 쓴다. */
  status: string
  /** 이 대상 게스트의 접근 종료. 기간은 줄이 아니라 대상이 갖는다(3_9_1 §8). */
  guest_access_ends_at: string | null
  /** 담당자. 문을 여닫을 수 있는 사람인지의 화면 판정에 쓴다(강제는 서버가 한다). */
  managers: { user_id: string }[]
}

const GuestHostContext = createContext<GuestHostConfig | null>(null)

export function GuestHostProvider({
  value,
  children,
}: {
  value: GuestHostConfig
  children: ReactNode
}) {
  return <GuestHostContext.Provider value={value}>{children}</GuestHostContext.Provider>
}

/**
 * 지금 화면이 다루는 게스트 맥락 설정. Provider 밖에서 부르면 잘못된 원장에 질의할 위험이
 * 있으므로 즉시 예외를 던진다.
 */
export function useGuestHost(): GuestHostConfig {
  const ctx = useContext(GuestHostContext)
  if (!ctx) {
    throw new Error('useGuestHost는 GuestHostProvider 내부에서만 사용할 수 있습니다.')
  }
  return ctx
}
