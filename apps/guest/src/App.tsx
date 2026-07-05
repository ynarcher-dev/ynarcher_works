import { MASTER_DATA_PACKAGE_NAME } from '@ynarcher/master-data'
import { UI_PACKAGE_NAME } from '@ynarcher/ui'

export function App() {
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-title-md font-bold text-gray-900">
        와이앤아처 통합 Works — <span className="text-brand">GUEST</span> 앱
      </h1>
      <p className="mt-2 text-body text-gray-600">
        모바일 우선 화면에 Tailwind CSS 디자인 토큰 이관이 완료되었습니다.
      </p>

      <ul className="mt-6 space-y-1 text-body text-gray-800">
        <li>공통 UI 패키지 연동 확인: {UI_PACKAGE_NAME}</li>
        <li>마스터 데이터 패키지 연동 확인: {MASTER_DATA_PACKAGE_NAME}</li>
      </ul>

      <div className="mt-6 flex flex-wrap gap-2">
        <span className="rounded border border-success-border bg-success-subtle px-2 py-0.5 text-caption text-success">
          완료
        </span>
        <span className="rounded border border-info-border bg-info-subtle px-2 py-0.5 text-caption text-info">
          진행
        </span>
        <span className="rounded border border-danger-border bg-danger-subtle px-2 py-0.5 text-caption text-danger">
          취소
        </span>
      </div>
    </main>
  )
}
