import { useMemo } from 'react'
import { BulkImportPage } from '@/features/bulk/BulkImportPage'
import { programBulkSpec } from '@/features/bulk/specs'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 원장 대용량 업로드(AC·M&A·PROJECT 공용).
 * 원장 테이블·명사·사업구분은 ProgramWorkspaceConfig가 정하므로, 화면은 명세 조립만 한다
 * (사업 공용 모듈의 config 주입 규칙과 같은 축 — AC를 고치면 M&A·PROJECT에 함께 반영된다).
 */
export function ProgramBulkPage() {
  const config = useProgramWorkspace()
  // 명세는 config당 한 번만 조립한다 — 매 렌더 새 객체를 주면 파일 파싱이 매번 다시 돈다.
  const spec = useMemo(() => programBulkSpec(config), [config])
  return <BulkImportPage spec={spec} />
}
