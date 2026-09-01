import type { ReactNode } from 'react'
import { tableText } from '../densityScale'

/**
 * 첨부 파일 1건 행 — WORKS 자료 관리(MaterialRow)와 GUEST 파일 목록이 공유하는 표시 규격.
 *
 * [아이콘 | 이름(+메타 줄) | 용량 | 액션들] 한 줄이며, 상자·간격·글자 단계는 여기가
 * 소유한다 — 같은 첨부 행이 두 앱에서 다른 모양이 되지 않게 하기 위해서다. 데이터 조회·
 * 다운로드·미리보기 방식은 앱마다 다르므로(WORKS는 Signed URL, GUEST는 게스트 통로)
 * 전부 슬롯으로만 받는다.
 */
export interface AttachmentRowProps {
  /** 좌측 파일 아이콘. 종류별 구분(오디오 음표 등)은 호출부가 정한다. */
  icon: ReactNode
  /** 행의 이름(표시명 또는 파일명) — 이 행의 유일한 식별 값. */
  name: string
  /** 이름 아래 회색 메타 줄(설명·파일명 등). 빈 값은 건너뛴다. */
  metaLines?: (string | null | undefined)[]
  /** 우측 용량 등 짧은 수치 텍스트. */
  size?: string
  /** 우측 끝 액션 버튼들(재생·미리보기·다운로드·삭제 …). */
  actions?: ReactNode
  /** 행 아래로 펼쳐지는 내용(오디오 플레이어·오류 문구). */
  children?: ReactNode
}

export function AttachmentRow({
  icon,
  name,
  metaLines,
  size,
  actions,
  children,
}: AttachmentRowProps) {
  return (
    <li className="rounded-radius-sm border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        {icon}
        {/* 이름은 이 행의 식별 값, 메타·용량은 곁값 — 크기는 하나로 두고 색으로만 가른다. */}
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${tableText.primary}`}>{name}</span>
          {(metaLines ?? [])
            .filter((line): line is string => Boolean(line))
            .map((line, i) => (
              <span key={i} className={`block truncate ${tableText.meta}`}>
                {line}
              </span>
            ))}
        </span>
        {size && (
          <span className={`shrink-0 tabular-nums ${tableText.meta}`}>{size}</span>
        )}
        {actions}
      </div>
      {children}
    </li>
  )
}
