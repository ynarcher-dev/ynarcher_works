import { MASTER_DATA_PACKAGE_NAME } from '@ynarcher/master-data'
import { UI_PACKAGE_NAME } from '@ynarcher/ui'

export function App() {
  return (
    <main>
      <h1>와이앤아처 통합 Works — WORKS 앱</h1>
      <p>모노레포 기반 Vite + React + TypeScript 초기화가 완료되었습니다.</p>
      <ul>
        <li>공통 UI 패키지 연동 확인: {UI_PACKAGE_NAME}</li>
        <li>마스터 데이터 패키지 연동 확인: {MASTER_DATA_PACKAGE_NAME}</li>
      </ul>
    </main>
  )
}
