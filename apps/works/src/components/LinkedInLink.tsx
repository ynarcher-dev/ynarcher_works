/**
 * 링크드인 아이콘 링크 — 목록과 상세가 공유하는 한 벌.
 *
 * 값이 없어도 항목은 선다. 빈 줄을 감추면 "이 사람은 링크드인이 없다"와 "이 화면은 링크드인을
 * 다루지 않는다"가 같은 빈자리로 보이고, 채워 넣을 칸이 있다는 사실 자체가 화면에서 사라진다.
 * 그래서 없음은 감추는 것이 아니라 **꺼진 아이콘**으로 말한다(목록이 먼저 내린 판단이며,
 * 상세도 같은 규칙을 쓴다).
 *
 * 글자('프로필 열기')가 아니라 아이콘인 이유는 값의 성격이다 — 링크드인 주소는 읽는 값이
 * 아니라 눌러서 나가는 문이라, 라벨 옆에 서는 것은 그 문이 열려 있는지 여부 하나면 된다.
 */
export function LinkedInLink({
  url,
  /** 행 전체가 눌리는 자리(목록 셀)에서 행 클릭과 겹치지 않게 한다. */
  stopRowClick,
}: {
  url: string | null | undefined
  stopRowClick?: boolean
}) {
  const href = typeof url === 'string' ? url.trim() : ''
  const icon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  )

  if (!href) {
    return (
      <span className="inline-flex text-gray-300" title="링크드인 없음" aria-label="링크드인 없음">
        {icon}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
      // 링크드인 공식 브랜드색. 외부 서비스 식별색은 팔레트 밖 예외다 — 회색으로 누르면
      // "링크드인으로 나간다"는 정보 자체가 사라진다. 이 컴포넌트 밖에서 쓰지 않는다.
      // eslint-disable-next-line no-restricted-syntax
      className="inline-flex text-[#0A66C2] hover:opacity-80"
      title="링크드인 프로필 열기"
      aria-label="링크드인 프로필 열기"
    >
      {icon}
    </a>
  )
}
