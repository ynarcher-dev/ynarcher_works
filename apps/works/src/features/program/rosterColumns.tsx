import type { Column } from '@ynarcher/ui'
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
 */
export function rosterColumns(
  masked: Record<SensitiveField, boolean>,
  persona: MasterTable,
): Column<RosterRow>[] {
  const spec = PARTICIPANT_PERSONAS[persona]
  return [
    {
      key: 'name',
      header: spec.nameHeader,
      type: 'name',
      render: (r) => {
        // 명단은 값을 복제하지 않고 원장을 가리키므로, 이름을 누르면 그 원장으로 간다.
        const to = spec.detailPath(r.master_id)
        return to ? (
          <Link
            to={to}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-info underline underline-offset-2 transition-opacity duration-fast hover:opacity-80"
          >
            {r.name}
          </Link>
        ) : (
          r.name
        )
      },
    },
    {
      key: 'contactName',
      header: spec.loginNameHeader,
      type: 'person',
      render: (r) => {
        if (!r.contactName) return <span className="text-gray-500">—</span>
        return masked.name ? maskName(r.contactName) : r.contactName
      },
    },
    {
      key: 'email',
      header: '이메일',
      type: 'text',
      render: (r) => {
        if (!r.email) return <span className="text-gray-500">—</span>
        return masked.email ? maskEmail(r.email) : r.email
      },
    },
    {
      key: 'phone',
      header: '연락처',
      type: 'text',
      render: (r) => {
        if (!r.phone) return <span className="text-gray-500">—</span>
        return masked.phone ? maskPhone(r.phone) : r.phone
      },
    },
  ]
}
