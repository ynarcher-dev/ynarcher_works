import type {
  FileCollectionAssignmentDto,
  FileCollectionNodeDto,
  FileCollectionStatus,
} from '@ynarcher/master-data'

/**
 * 관제 표 한 줄(대상 × 문항).
 *
 * 별도 파일에 두는 이유는 순환 참조를 만들지 않기 위해서다 — 관제 탭이 상세 창을 열고 상세
 * 창이 이 줄의 모양을 알아야 하므로, 둘이 서로를 가져오면 모듈 그래프에 고리가 생긴다.
 *
 * `responseId`가 `null`인 줄은 **응답 칸이 아직 서지 않은 미제출**이다(공개 직후·배정 직후).
 * 감추지 않고 세우는 것이 관제의 요구이며, 열 것이 없으므로 상세는 열리지 않는다.
 */
export interface MonitorResponseRow {
  key: string
  responseId: string | null
  assignment: FileCollectionAssignmentDto
  node: FileCollectionNodeDto
  status: FileCollectionStatus
  round: number
  submittedAt: string | null
}
