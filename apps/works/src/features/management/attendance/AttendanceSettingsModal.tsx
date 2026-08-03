import { Button, Modal, Spinner, Tabs, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { AttendancePolicySection } from '@/features/management/attendance/AttendancePolicySection'
import { AttendanceStatusSection } from '@/features/management/attendance/AttendanceStatusSection'
import {
  useAttendancePolicies,
  useAttendanceStatuses,
} from '@/features/management/attendance/attendanceConfigApi'

type SettingsTab = 'policy' | 'status'

const TABS = [
  { key: 'policy', label: '근무 기준' },
  { key: 'status', label: '근태 상태' },
]

/**
 * 근태 설정 — 근무 기준(전사 기본 + 임직원별 예외)과 근태 상태 원장.
 *
 * 사이드바 메뉴를 늘리지 않고 근태 관리 화면의 상단 액션에 둔다. 목록이 주인공이고 기준은
 * 가끔 여는 값이라, 자산 관리가 등록 모달을 다루는 것과 같은 자리다.
 */
export function AttendanceSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<SettingsTab>('policy')
  const policiesQuery = useAttendancePolicies()
  const statusesQuery = useAttendanceStatuses()

  const loading = policiesQuery.isLoading || statusesQuery.isLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="근태 설정"
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-4">
        <Tabs items={TABS} value={tab} onChange={(k) => setTab(k as SettingsTab)} />

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : tab === 'policy' ? (
          <AttendancePolicySection
            policies={policiesQuery.data ?? []}
            onSaved={(msg) => toast.show(msg, 'success')}
            onFailed={() => toast.show('저장에 실패했습니다. 입력값과 권한을 확인하세요.', 'danger')}
          />
        ) : (
          <AttendanceStatusSection
            statuses={statusesQuery.data ?? []}
            onSaved={(msg) => toast.show(msg, 'success')}
            onFailed={() => toast.show('저장에 실패했습니다. 입력값과 권한을 확인하세요.', 'danger')}
          />
        )}
      </div>
    </Modal>
  )
}
