import type { ReactNode } from 'react'
import type { InfoPair } from '@/features/approval/ApprovalInfoTable'

/**
 * 문서 머리에 적히는 사실들. 기안 화면은 아직 정해지지 않은 값을 null로 넘긴다
 * (문서 번호는 상신할 때 채번되고, 완료 일시는 결재가 끝나야 생긴다).
 */
export interface ApprovalHeaderFacts {
  /** 대분류 > 양식. 기안 화면은 고르는 컨트롤을, 상세는 고른 결과를 넘긴다. */
  formPath: ReactNode
  docNo: string | null
  deptName: string
  /** 기안자 — 이름·직책(직급)을 넘기면 표기 형식은 approvalDrafterLabel()이 정한다. */
  drafter: { name: string; jobTitle: string }
  /** '영구 / A등급'. 양식이 정하므로 양식을 고르기 전에는 null. */
  retentionGrade: string | null
  amount: ReactNode
  createdAt: string | null
  completedAt: string | null
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : '-')

/**
 * 기안자 표기 — `이름 / 직책(직급)`.
 *
 * **소속은 적지 않는다**(2026-08-26). 바로 왼쪽 칸이 '기안 부서'이고 그 값이 곧 기안자의
 * 소속이라, 같은 사실이 한 줄 안에 두 번 적혀 있었다. 같은 값을 두 자리에 두면 언젠가
 * 서로 다른 값을 말하는 날이 오고(대리 기안·부서 이동), 그때 어느 쪽이 진짜인지 판정할
 * 근거가 없다.
 *
 * 구분자는 같은 표의 '보존 연한 / 보안 등급'과 같은 ` / `를 쓴다 — 한 칸 안에 여러 사실을
 * 담을 때의 표기가 행마다 다르면 같은 표가 두 규칙으로 읽힌다.
 *
 * 직책과 직급 중 무엇을 적을지는 여기서 정하지 않는다 — 태그 원장의 표기 방식을 읽는
 * `jobTitleLabel`(useJobTitleLabel)이 이미 답을 갖고 있고, 화면은 그 결과를 받아 놓기만 한다.
 * 비어 있는 조각은 건너뛴다(직책이 없는 사람에게 빈 슬래시가 남지 않도록).
 */
export function approvalDrafterLabel(d: { name: string; jobTitle: string }): string {
  return [d.name, d.jobTitle]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(' / ')
}

/**
 * 문서 머리의 행 목록 — **기안 화면과 상세 화면이 함께 쓰는 단일 소유자**.
 *
 * 두 화면이 각자 배열을 적던 동안 항목 수(4 vs 8)도 라벨('작성자' vs '기안자')도 순서도
 * 갈렸다. 결재 문서의 머리는 양식이 정의하지 않는 **표준 부분**이라 화면에 따라 달라질
 * 이유가 없다 — 무엇을 적고 있는지와 무엇이 적혔는지가 같은 자리에서 읽혀야 한다.
 *
 * 아직 값이 없는 칸도 자리를 지운다 — 상신하고 나서 없던 줄이 생기면 문서가 달라 보인다.
 */
export function approvalHeaderPairs(f: ApprovalHeaderFacts): InfoPair[] {
  return [
    { label: '문서 종류', value: f.formPath },
    // 채번은 DRAFT를 벗어나는 순간 트리거가 한다. 그전까지는 '미채번'이 사실이다.
    { label: '문서 번호', value: f.docNo ?? '미채번' },
    { label: '기안 부서', value: dash(f.deptName) },
    { label: '기안자', value: dash(approvalDrafterLabel(f.drafter)) },
    { label: '보존 연한 / 보안 등급', value: dash(f.retentionGrade) },
    { label: '문서 금액', value: f.amount },
    { label: '기안 일시', value: dash(f.createdAt) },
    { label: '완료 일시', value: dash(f.completedAt) },
  ]
}
