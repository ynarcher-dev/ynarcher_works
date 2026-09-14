import { FileDropZone } from '@ynarcher/ui'

/**
 * 자료 첨부 입력 영역(WORKS 자료 관리·파일첨부). 상자 자체는 공용
 * `FileDropZone`(`packages/ui`)이 소유하며, 여기 남은 것은 이 화면이 쓰는 문구뿐이다 —
 * GUEST 파일받기도 같은 상자를 쓰므로 모양이 두 벌로 갈리지 않는다(2026-09-14).
 *
 * 등록 폼(보류 첨부)과 상세 수정 폼(즉시 업로드)이 동일한 UI를 공유하기 위한 컴포넌트다.
 * 실제 업로드/보류 처리는 호출부가 결정한다.
 */
export function MaterialDropZone({
  onFiles,
  busy = false,
}: {
  onFiles: (files: File[]) => void
  /** 업로드 진행 중. 상자를 잠그고 문구를 진행 상태로 바꾼다. */
  busy?: boolean
}) {
  return <FileDropZone onFiles={onFiles} busy={busy} />
}
