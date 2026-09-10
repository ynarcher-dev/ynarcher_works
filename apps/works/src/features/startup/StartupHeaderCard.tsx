import { Badge, EntityHeaderCard, EntityHeaderSection, InfoField, InfoGrid } from '@ynarcher/ui'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { SensitiveValue } from '@/features/master/SensitiveValue'
import type { EntityRow } from '@/features/master/entityHooks'
import { isInvested, managementStatusLabel } from '@/features/startup/startupClassification'
import { readAddresses, readBusiness } from '@/features/startup/startupProfile'
import { formatFounded, readIndustries } from '@/features/startup/startupGrowth'

/** 첨부/피드백/기여 로그 대상 유형(다형 테이블 target_type). 원장이 하나라 화면마다 갈리지 않는다. */
const RESOURCE_TYPE = 'startup'

const Info = InfoField

/** 날짜 문자열의 앞 10자리(YYYY-MM-DD). 값이 없으면 null을 돌려 빈 값 표기를 InfoField에 맡긴다. */
function formatDate(v: unknown): string | null {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : null
}

/** 원장 스칼라 값 → 문자열(빈 값은 null). 민감정보 컴포넌트에 넘길 때 쓴다. */
function text(v: unknown): string | null {
  return v == null || v === '' ? null : String(v)
}

/**
 * 기업 상세 헤더 카드 — 사진 + 이름/업종 배지 + 한 줄 소개 + 칩 줄 + 정보행(대표자·연락 축·설립일 …).
 *
 * STARTUP 상세와 FUND 투자 집행 상세가 **같은 기업을 세우는 자리**라 규격을 여기 하나에 모은다.
 * 복사했으면 정보행의 항목과 순서가 두 벌이 되고, 한쪽에 칸을 더하는 날 다른 쪽만 옛 구성으로
 * 남는다 — 같은 기업을 두 화면에서 보는 눈이 매번 자리를 다시 찾게 된다.
 *
 * **화면마다 갈리는 것은 둘뿐**이다. 민감정보 정책 키(`contentKey`)는 '어느 목록의 상세인가'가
 * 정하고(STARTUP은 구분별 메뉴 키, FUND는 `fund.portfolio`), 딜메이커 이름은 담당자 원장을
 * 읽는 쪽이 이미 손에 쥐고 있어 여기서 다시 조회하지 않는다.
 */
/** 주소 목록을 헤더 한 칸에 적는다. 비면 정보행의 빈 값 표기를 그대로 쓴다. */
function addressLine(record: EntityRow): string {
  const list = readAddresses(record)
  if (list.length === 0) return '-'
  if (list.length === 1) return list[0]!.detail
  return list.map((a) => `${a.kind} ${a.detail}`).join(', ')
}

export function StartupHeaderCard({
  record,
  contentKey,
  leadName,
}: {
  record: EntityRow
  /** ADMIN '민감정보 관리'의 콘텐츠 키 — 대표자·이메일·연락처의 마스킹 여부를 가른다. */
  contentKey: string
  /** 딜메이커 = 담당자 원장의 리드. 투자기업에만 지정되므로 그 외에는 빈 값으로 선다. */
  leadName: string | null
}) {
  const invested = isInvested(record.management_status)
  const str = (key: string) => {
    const v = record[key]
    return v == null || v === '' ? '-' : String(v)
  }
  const logo = record.logo_url ? String(record.logo_url) : null
  const industries = readIndustries(record)
  // 부제 자리에는 한 줄 소개(business_profile.oneLiner)를 노출한다.
  const oneLiner = readBusiness(record).oneLiner ?? ''

  /** 대표자·이메일·연락처는 외부 기업 정보 — 정책 키와 로그 컨텍스트를 세 번 적지 않는다. */
  const masked = (field: 'name' | 'email' | 'phone', value: unknown) => (
    <SensitiveValue
      field={field}
      contentKey={contentKey}
      value={text(value)}
      resourceType={RESOURCE_TYPE}
      resourceId={record.id}
    />
  )

  return (
    /* 카드 규격(사진·제목·배지·부제·칩 줄·구분선·정보행)은 화면이 아니라 공용
       `EntityHeaderCard`가 소유한다 — 상세 헤더가 페이지 맥락이라는 규칙(24px 제목 옆
       배지가 카드 규격 11px로 찍히지 않게 하는 것)도 그 카드가 함께 갖는다. */
    <EntityHeaderCard
      photo={<PhotoBox src={logo} />}
      title={record.name}
      badges={industries.map((ind) => (
        <Badge key={ind} tone="neutral">
          {ind}
        </Badge>
      ))}
      description={oneLiner}
      chips={
        <>
          {str('stage') !== '-' && <Badge tone="neutral">{str('stage')}</Badge>}
          {managementStatusLabel(record.management_status) && (
            <Badge tone={invested ? 'info' : 'neutral'}>
              {managementStatusLabel(record.management_status)}
            </Badge>
          )}
          {invested && str('pool_status') !== '-' && (
            <Badge tone="success" dot>
              {str('pool_status')}
            </Badge>
          )}
        </>
      }
      info={
        <InfoGrid>
          <Info label="대표자" value={masked('name', record.representative)} />
          <Info label="이메일" value={masked('email', record.email)} />
          <Info label="연락처" value={masked('phone', record.phone)} />
          <Info label="회사 형태" value={str('company_form')} />
          <Info label="설립일" value={formatFounded(record.founded_on)} />
          <Info label="사업자등록번호" value={str('biz_reg_no')} />
          <Info label="소재지" value={str('location')} />
          {/* 상세주소는 길 수 있어 소재지 오른쪽 2열을 차지한다(이 그리드의 마지막 칸).
              여러 줄이면 구분(지사·연구소)을 앞에 붙여 쉼표로 잇는다 — 본사 하나뿐일 때는
              구분을 적지 않는다(라벨이 이미 '상세주소'이고, 한 줄뿐인데 '본사'를 붙이면
              읽는 사람이 다른 줄을 찾게 된다). */}
          <Info
            label="상세주소"
            value={addressLine(record)}
            className="min-w-0 sm:col-span-2"
            valueClassName="min-w-0 flex-1 truncate"
          />
        </InfoGrid>
      }
    >
      {/* 발굴 경로는 길 수 있어 전체 폭을 쓰되, 표시 규격은 위 정보행(Info)과 동일하게 맞춘다.
          구분선을 그은 한 묶음이라는 사실은 화면이 아니라 `EntityHeaderSection`이 적는다. */}
      <EntityHeaderSection>
        <Info label="발굴 경로" value={str('discovery_source')} />
      </EntityHeaderSection>

      {/* 이 레코드를 누가 맡고 누가 만들었는지 — 업무 사실(위 칸)과 다른 축이라 줄을 나눈다.
          딜메이커만 도메인 값이고(관리 주체) 생성자·수정일은 레코드를 다룬 흔적이라
          한 단 연한 메타 톤으로 물러난다. 담당자 전원은 아래 관리 현황 카드가 답한다. */}
      <EntityHeaderSection>
        <InfoGrid>
          <Info label="딜메이커" value={leadName} />
          <Info label="생성자" value={record.creator?.name || null} meta />
          <Info label="수정일" value={formatDate(record.updated_at)} meta />
        </InfoGrid>
      </EntityHeaderSection>
    </EntityHeaderCard>
  )
}
