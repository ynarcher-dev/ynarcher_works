import { Button, Input, Modal, TokenMultiSelect } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import type { Branch, BranchInput } from '@/features/office/branches/branchesApi'

interface Sel {
  userId: string
  name: string
}

interface Props {
  open: boolean
  /** 있으면 수정, 없으면 생성. */
  branch?: Branch
  /** 수정 대상의 현재 배정인력 id(생성 시 빈 배열). */
  memberIds: string[]
  busy: boolean
  onClose: () => void
  onSubmit: (v: BranchInput) => void
}

/**
 * ADMIN 지사 생성/수정 폼. 지사명·주소·전화번호·배정인력(복수).
 * 배정인력은 임직원 원장에서 골라 담기만 한다 — 계정 생성은 MANAGEMENT 인사 관리가 소유한다.
 */
export function BranchFormModal({ open, branch, memberIds, busy, onClose, onSubmit }: Props) {
  const editing = Boolean(branch)
  const { data: employees } = useEmployees()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [members, setMembers] = useState<Sel[]>([])
  const [err, setErr] = useState('')

  const byId = useMemo(
    () => new Map((employees ?? []).map((e) => [e.id, e] as const)),
    [employees],
  )
  const options: Sel[] = useMemo(
    () => (employees ?? []).map((e) => ({ userId: e.id, name: e.name })),
    [employees],
  )

  // 열릴 때마다 대상에 맞춰 초기화(임직원 목록이 늦게 와도 이름이 채워지도록 byId를 함께 본다).
  useEffect(() => {
    if (!open) return
    setName(branch?.name ?? '')
    setAddress(branch?.address ?? '')
    setPhone(branch?.phone ?? '')
    setMembers(memberIds.map((id) => ({ userId: id, name: byId.get(id)?.name ?? '알 수 없음' })))
    setErr('')
  }, [open, branch, memberIds, byId])

  const submit = () => {
    if (!name.trim()) return setErr('지사명을 입력하세요.')
    setErr('')
    onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      memberIds: members.map((m) => m.userId),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '지사 수정' : '지사 추가'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '생성'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">지사명</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 강남지사"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">전화번호</span>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="예: 02-1234-5678"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-caption font-medium text-gray-600">주소</span>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 서울특별시 강남구 테헤란로 123, 6층"
          />
        </label>

        <div>
          <span className="mb-1 block text-caption font-medium text-gray-600">배정인력</span>
          <TokenMultiSelect<Sel>
            selected={members}
            onChange={setMembers}
            options={options}
            getKey={(s) => s.userId}
            getLabel={(s) => s.name}
            getMeta={(s) => byId.get(s.userId)?.email ?? undefined}
            placeholder="임직원 검색 후 추가"
          />
        </div>

        {err && <p className="text-caption text-danger">{err}</p>}
      </div>
    </Modal>
  )
}
