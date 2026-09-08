import type { Column } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { maskEmail, maskName, maskPhone } from '@/lib/mask'
import type { SensitiveField } from '@/features/admin/sensitiveContents'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import type { RosterRow } from '@/features/program/rosterHooks'

/**
 * 참가자 목록 표의 컬럼 — **기업명 · 대표자명 · 이메일 · 연락처 넷**(2026-09-09 사용자 지정).
 *
 * GUEST 명부 표(`participantColumns`)와 컬럼이 다른 것이 이 화면의 요점이다. 저쪽은 문(門)을
 * 다루므로 상태·최종 접속·계정 유무가 서고, 여기는 '누가 참가하는가'만 답하므로 그 넷이 없다 —
 * 같은 표를 두 벌 두는 것이 아니라 **다른 물음에 답하는 두 표**다.
 *
 * 이메일과 연락처를 한 칸에 합치지 않는다(저쪽은 합친다). 저쪽에서 합칠 수 있었던 이유는
 * 그 칸이 '인증이 어디로 가는가' 하나를 답하기 때문이고, 여기서는 둘 다 그냥 연락 수단이라
 * 하나를 골라 보여 주면 나머지 하나가 비었는지 있는지를 화면이 답하지 못한다.
 *
 * 머리글의 낱말은 이 파일이 아니라 자격 설정(`PARTICIPANT_PERSONAS`)이 소유한다 — 자격마다
 * 부르는 말이 다르고(기업명/전문가명, 대표자/담당자/성명), 여기서 삼항으로 가르면 자격이
 * 하나 늘 때마다 표를 고치는 일이 된다.
 *
 * 표기는 ADMIN '민감정보 관리'의 정책을 그대로 따른다.
 *
 * **원장으로 가는 길은 이름이 아니라 빈 칸이 갖는다**(2026-09-09 사용자 지정). 종전에는
 * 기업명이 링크였는데, 그 자리에서 이름을 눌러 얻는 것은 '더 보기'이지 이 표가 남긴 일이
 * 아니었다. 이 표에서 실제로 남는 일은 **비어 있는 값을 채우는 것**이고, 그 값은 여기서
 * 고칠 수 없다 — 명단은 값을 복제하지 않고 원장을 가리키므로 채우는 자리가 원장 하나다.
 * 그래서 `—`가 서 있던 자리에 `입력`이 서서 **어디서 채우는지를 빈 칸이 스스로 답한다.**
 *
 * 이름에서 링크를 걷은 대가로 '그냥 상세를 보고 싶을 때'의 길이 이 표에서 사라진다. 그것을
 * 감수하는 이유는 **한 줄에 파란 글자가 여럿이면 어느 것이 주인인지 묻히기** 때문이다
 * (5_component_spec_rules §3.4.1의 이유와 같다) — 채워야 할 칸이 그 줄에서 가장 눈에 띄어야
 * 하는데, 이름이 늘 링크면 그 신호가 모든 줄에 똑같이 서서 아무것도 가리키지 못한다.
 */
export function rosterColumns(
  masked: Record<SensitiveField, boolean>,
  persona: MasterTable,
): Column<RosterRow>[] {
  const spec = PARTICIPANT_PERSONAS[persona]

  /**
   * 값이 있으면 값을, 없으면 원장으로 가는 `입력`을 세운다.
   *
   * 새 탭으로 여는 이유는 이 표가 **여러 줄을 연이어 채우는 자리**이기 때문이다 — 같은 탭에서
   * 넘어가면 채우고 돌아올 때마다 사업 상세 → 모달 → 탭을 다시 밟아야 한다.
   *
   * 클릭을 멈추는 것은 지금 필요해서가 아니라(이 표는 `onRowClick`을 주지 않는다) 나중에 행
   * 클릭이 붙는 날 이 링크가 두 가지 일을 함께 하지 않게 하기 위해서다.
   */
  const cell = (value: string | null, shown: () => ReactNode, masterId: string): ReactNode => {
    if (value) return shown()
    const to = spec.detailPath(masterId)
    // 갈 곳이 없으면 채우라고 말하지 않는다 — 누를 수 없는 안내는 안내가 아니다.
    if (!to) return <span className="text-gray-500">—</span>
    return (
      <Link
        to={to}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-info transition-opacity duration-fast hover:opacity-80"
      >
        입력
      </Link>
    )
  }

  return [
    {
      key: 'name',
      header: spec.nameHeader,
      type: 'name',
      // 이름은 평문이다 — 이 표에서 이름은 값이지 길이 아니다(위 주석).
      render: (r) => <span className="font-medium text-gray-900">{r.name}</span>,
    },
    {
      key: 'contactName',
      header: spec.loginNameHeader,
      type: 'person',
      render: (r) =>
        cell(
          r.contactName,
          () => (masked.name ? maskName(r.contactName!) : r.contactName),
          r.master_id,
        ),
    },
    {
      key: 'email',
      header: '이메일',
      type: 'text',
      render: (r) =>
        cell(r.email, () => (masked.email ? maskEmail(r.email!) : r.email), r.master_id),
    },
    {
      key: 'phone',
      header: '연락처',
      type: 'text',
      render: (r) =>
        cell(r.phone, () => (masked.phone ? maskPhone(r.phone!) : r.phone), r.master_id),
    },
  ]
}
