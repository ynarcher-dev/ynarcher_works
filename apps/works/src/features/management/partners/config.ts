/**
 * 거래처 원장의 값 목록 — 구분 2종과 금융기관 이름표.
 *
 * 원장(public.trade_partners)이 담는 것은 금융기관 코드 3자리(표준값)이고, 그 코드를 무엇이라
 * 부르는지는 여기가 갖는다. 이름을 저장하지 않는 이유는 이름이 바뀌기 때문이다 —
 * KEB하나은행은 하나은행이 되었고 대구은행은 iM뱅크가 되었다. 이름을 담아 두었다면 그날 이후
 * 등록한 행과 그 전에 등록한 행이 다른 은행처럼 갈렸을 것이다.
 */

export type PartnerType = 'CORPORATE' | 'INDIVIDUAL'

/** 구분 라벨. 셀렉트 순서도 이 순서다(법인이 대다수라 먼저 선다). */
export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  CORPORATE: '법인',
  INDIVIDUAL: '개인',
}

export const PARTNER_TYPE_ORDER: PartnerType[] = ['CORPORATE', 'INDIVIDUAL']

/**
 * 등록번호 칸의 이름은 구분이 정한다 — 법인은 사업자등록번호, 개인은 생년월일이다.
 * 같은 칸에 다른 값을 받으므로 라벨도 함께 갈려야 무엇을 적는 자리인지 헷갈리지 않는다.
 */
export function registrationLabel(type: PartnerType): string {
  return type === 'CORPORATE' ? '사업자등록번호' : '생년월일'
}

/** 증빙 서류 칸의 이름도 구분이 정한다(법인=사업자등록증, 개인=신분증). */
export function licenseLabel(type: PartnerType): string {
  return type === 'CORPORATE' ? '사업자등록증' : '신분증'
}

/**
 * 금융기관 목록(코드 3자리 + 이름). 순서는 쓰이는 빈도 순이다 — 사전순으로 두면 목록의
 * 첫머리가 실제로 고를 일이 거의 없는 이름들로 채워진다.
 *
 * 목록에 없는 곳(증권사 CMA·해외 송금)을 받아야 하는 날이 오면 값을 여기 더한다. 자유입력으로
 * 열지 않는 이유는 한 은행이 '국민은행'과 'KB국민은행' 두 이름으로 갈리는 것을 막기 위해서다.
 */
export const BANKS: { code: string; label: string }[] = [
  { code: '004', label: '국민은행' },
  { code: '088', label: '신한은행' },
  { code: '081', label: '하나은행' },
  { code: '020', label: '우리은행' },
  { code: '011', label: '농협은행' },
  { code: '003', label: '기업은행' },
  { code: '090', label: '카카오뱅크' },
  { code: '092', label: '토스뱅크' },
  { code: '089', label: '케이뱅크' },
  { code: '023', label: 'SC제일은행' },
  { code: '027', label: '한국씨티은행' },
  { code: '002', label: '한국산업은행' },
  { code: '007', label: '수협은행' },
  { code: '012', label: '지역농축협' },
  { code: '045', label: '새마을금고' },
  { code: '048', label: '신협' },
  { code: '071', label: '우체국' },
  { code: '050', label: '저축은행' },
  { code: '064', label: '산림조합' },
  { code: '032', label: '부산은행' },
  { code: '031', label: 'iM뱅크(대구)' },
  { code: '039', label: '경남은행' },
  { code: '034', label: '광주은행' },
  { code: '037', label: '전북은행' },
  { code: '035', label: '제주은행' },
]

const BANK_LABELS: Record<string, string> = Object.fromEntries(
  BANKS.map((b) => [b.code, b.label]),
)

/**
 * 코드 → 이름. 목록에서 뺀 코드가 원장에 남아 있어도 칸을 비우지 않는다 — 값이 사라진 것처럼
 * 보이면 그 행을 고치는 순간 실제로 사라진다.
 */
export function bankLabel(code: string | null): string | null {
  if (!code) return null
  return BANK_LABELS[code] ?? `코드 ${code}`
}

/** 증빙 서류 한 건의 크기 상한(스캔한 등록증·통장 사본이 넉넉히 들어간다). */
export const PARTNER_DOC_MAX_BYTES = 10_000_000

/** 서류 첨부 허용 형식 — 스캔본(이미지)과 전자문서(PDF). */
export const PARTNER_DOC_ACCEPT = 'image/*,application/pdf'
