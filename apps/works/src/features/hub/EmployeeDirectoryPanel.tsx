import { DataTable, Spinner, type Column } from '@ynarcher/ui'
import { maskEmail } from '@/lib/mask'
import { useEmployees, type Employee } from '@/features/hub/hooks'

const columns: Column<Employee>[] = [
  { key: 'name', header: '이름', render: (r) => r.name },
  { key: 'user_type', header: '역할', render: (r) => r.user_type },
  {
    key: 'email',
    header: '이메일',
    render: (r) => maskEmail(r.email),
  },
]

/** 임직원 프로필 디렉토리(이메일 기본 마스킹). */
export function EmployeeDirectoryPanel() {
  const { data, isLoading } = useEmployees()
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="등록된 임직원이 없습니다."
    />
  )
}
