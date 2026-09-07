import { Badge } from '@ynarcher/ui'
import {
  managementStatusLabel,
  managementStatusTone,
} from '@/features/startup/startupClassification'

/** 한 줄로 고를 때 필요한 최소 형태. 원장 행 전체를 요구하지 않는다. */
export interface StartupPickRowValue {
  name: string
  representative: string | null
  management_status: string | null
}

/**
 * 스타트업 한 곳을 **한 줄로 고르는 자리**의 행 — 기업명 · 대표자명 + 구분 배지.
 *
 * 세 값이 이 조합인 이유는 고르는 사람이 실제로 묻는 것이 셋이기 때문이다: 이 이름이 맞나,
 * 같은 이름 중 어느 쪽인가(대표자), 우리와 어떤 관계인 기업인가(구분). 이름만 세우면 동명의
 * 기업에서 고를 근거가 없고, 열을 더 세우면 목록이 아니라 표가 된다.
 *
 * FUND 피투자사 검색이 이 규격의 정본이었고, M&A BUYER의 기업명 돋보기가 같은 일을 하게
 * 되면서 여기로 꺼냈다 — 같은 원장을 같은 방식으로 고르는 자리가 둘이 되는 순간, 값을 베껴
 * 맞춰 두는 방식은 한쪽만 고쳐지는 날 반드시 갈린다(돋보기 규격이 먼저 밟은 길이다).
 *
 * 행을 감싸는 것(`<li>`·`<button>`·테두리·간격)은 이 컴포넌트가 갖지 않는다 — 목록이 오버레이인지
 * 모달인지에 따라 다르고, 그것은 행의 규격이 아니라 목록의 규격이다.
 */
export function StartupPickRow({ value }: { value: StartupPickRowValue }) {
  const label = managementStatusLabel(value.management_status)
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-body text-gray-900">
        <span className="font-medium">{value.name}</span>
        {value.representative && (
          <span className="text-gray-500"> · {value.representative}</span>
        )}
      </span>
      {label && (
        <span className="shrink-0">
          <Badge tone={managementStatusTone(value.management_status)}>{label}</Badge>
        </span>
      )}
    </>
  )
}
