import { Banner } from '@ynarcher/ui'

export interface BulkUploadNoticesProps {
  /** 같은 내용의 파일이 이미 올라온 적이 있으면 그 이력. 없으면 null. */
  priorUpload: { filename: string | null; created_at: string } | null
  internalCount: number
  orgNameCount: number
  foldedCount: number
  corruptCount: number
  unsetCategory: number
  unsetCountry: number
  unknownFields: string[]
}

/**
 * 리뷰 표 위에 서는 안내 묶음 — **화면이 대신 판단한 것을 전부 밝히는 자리**다.
 *
 * 접지 않는다. 안내를 도움말 말풍선으로 접는 규칙(CLAUDE.md 2026-09-01)의 예외가 바로 이런
 * 것들이라, 여기 서는 넷은 조용히 사라지거나 조용히 바뀐 행을 알리는 고지이고 나머지 둘은
 * 저장 뒤에 어디서 찾을지를 미리 일러 준다. 되돌릴 자리가 있는지까지 함께 말한다 — 자사 제외는
 * 되돌릴 수 없고(정책), 조직명 의심은 행의 결정을 바꾸면 되며, 미지정 구분은 목록 필터가 받는다.
 */
export function BulkUploadNotices({
  priorUpload,
  internalCount,
  orgNameCount,
  foldedCount,
  corruptCount,
  unsetCategory,
  unsetCountry,
  unknownFields,
}: BulkUploadNoticesProps) {
  return (
    <>
      {priorUpload && (
        <Banner tone="warning">
          동일한 내용의 파일이 <b>{priorUpload.created_at.slice(0, 10)}</b>에 이미 업로드된 이력이
          있습니다{priorUpload.filename ? ` (${priorUpload.filename})` : ''}. 중복 업로드가 아닌지
          확인하세요.
        </Banner>
      )}

      {(internalCount > 0 || orgNameCount > 0 || foldedCount > 0 || corruptCount > 0) && (
        <Banner tone="info">
          {internalCount > 0 && (
            <>
              자사 임직원 <b>{internalCount}건</b>은 제외했습니다 — 이 원장이 담는 것은 회사 밖
              사람입니다.{' '}
            </>
          )}
          {orgNameCount > 0 && (
            <>
              이름 칸이 조직명으로 보이는 <b>{orgNameCount}건</b>은 건너뛰기로 두었습니다. 사람이
              맞으면 그 행의 결정을 바꾸십시오.{' '}
            </>
          )}
          {foldedCount > 0 && (
            <>
              같은 파일 안에서 겹친 <b>{foldedCount}건</b>은 한 줄로 접었습니다.{' '}
            </>
          )}
          {corruptCount > 0 && (
            <>
              엑셀이 망가뜨린 번호 <b>{corruptCount}건</b>은 연락처를 비웠습니다. 리멤버에서 받은
              원본 CSV를 엑셀로 열어 저장하지 마십시오.
            </>
          )}
        </Banner>
      )}

      {unsetCategory > 0 && (
        <Banner tone="warning">
          구분을 짐작할 소속이 없어 <b>{unsetCategory}건</b>이 미지정으로 올라갑니다. 목록의 구분
          필터 '미지정'에서 다시 찾아 채울 수 있습니다.
        </Banner>
      )}

      {unsetCountry > 0 && (
        <Banner tone="warning">
          국가 미확인 <b>{unsetCountry}건</b>은 업로드할 수 없습니다. 표의 국가 열에서 지정하거나,
          행을 선택한 뒤 국가를 일괄 지정해 주세요.
        </Banner>
      )}

      {unknownFields.length > 0 && (
        <Banner tone="warning">
          ADMIN 영역 관리에 없는 영역이 있습니다 — <b>{unknownFields.join(', ')}</b>. 이대로 올리면
          값은 저장되지만 목록의 영역 필터에는 걸리지 않습니다. 필요하면 먼저 영역을 등록하세요.
        </Banner>
      )}
    </>
  )
}
