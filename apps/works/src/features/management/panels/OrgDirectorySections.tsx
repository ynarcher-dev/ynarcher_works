import { CardHeading, PhotoBox } from '@ynarcher/ui'
import { User } from 'lucide-react'
import type { DirectoryMember, DirectorySection } from '@/features/management/panels/directoryModel'

interface OrgDirectorySectionsProps {
  sections: DirectorySection[]
  /** 인물 카드 클릭 시 이동(임직원 상세). 미지정이면 카드는 정적으로 렌더한다. */
  onSelectMember?: (member: DirectoryMember) => void
}

/**
 * 인물 카드 한 장 — 사진·이름·자리 표기. 세 줄 이상 얹지 않는다(찾는 화면이지 읽는 화면이 아니다).
 * 사진은 임직원 상세 헤더와 같은 정사각 `PhotoBox` 규격을 쓴다 — 같은 사람을 두 화면에서
 * 다른 모양으로 자르면 목록에서 본 얼굴과 상세에서 본 얼굴이 같은 사진인지 매번 되짚게 된다.
 */
function MemberCard({
  member,
  onSelect,
}: {
  member: DirectoryMember
  onSelect?: (member: DirectoryMember) => void
}) {
  const body = (
    <>
      <PhotoBox
        size="md"
        src={member.photo}
        alt={member.name}
        placeholder={<User size={24} />}
      />
      {/* 이름과 자리 표기(직급 직책)는 한 덩어리로 붙이고, 크기는 같게 두되 색으로만 위계를 만든다.
          값이 없으면 '-'를 찍지 않고 줄만 비워 둔다 — 카드 높이는 유지해야 격자가 어긋나지 않는다. */}
      <span className="w-full space-y-0.5">
        <span className="block truncate text-body font-medium text-gray-900">{member.name}</span>
        <span className="block truncate text-body text-gray-500">{member.title || ' '}</span>
      </span>
    </>
  )
  const shape = 'flex w-24 flex-col items-center gap-2 rounded-radius-md p-2 text-center'
  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(member)}
      className={`${shape} transition-colors duration-fast hover:bg-gray-50`}
    >
      {body}
    </button>
  ) : (
    <div className={shape}>{body}</div>
  )
}

/**
 * 조직도 디렉터리의 우측 인물 목록. 부서(전체 경로)를 머리글로 세우고 그 아래에 인물 카드를 편다.
 * 부서 경계는 카드 테두리가 아니라 머리글 + 가로선이 나눈다 — 카드가 카드를 품으면
 * 얼굴 격자보다 상자가 먼저 읽힌다.
 */
export function OrgDirectorySections({ sections, onSelectMember }: OrgDirectorySectionsProps) {
  return (
    <div className="divide-y divide-gray-100">
      {sections.map((section) => (
        <section key={section.deptId} className="space-y-2 py-4 first:pt-0 last:pb-0">
          <CardHeading level="subhead" count={section.members.length}>
            {section.path}
          </CardHeading>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {section.members.map((m) => (
              <MemberCard key={m.id} member={m} onSelect={onSelectMember} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
