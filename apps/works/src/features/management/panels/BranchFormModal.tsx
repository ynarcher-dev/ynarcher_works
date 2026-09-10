import { Button, Card, Field, Input, Modal, formText } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { BranchMemberPanes } from '@/features/management/panels/BranchMemberPanes'
import type { Branch, BranchInput } from '@/features/office/branches/branchesApi'

interface Props {
  open: boolean
  /** 있으면 수정, 없으면 생성. */
  branch?: Branch
  /** 수정 대상의 현재 상주인력 id(생성 시 빈 배열). */
  memberIds: string[]
  busy: boolean
  onClose: () => void
  onSubmit: (v: BranchInput) => void
  /** 수정일 때만 쓰는 활성/비활성 전환. 지사를 지우지 않고 OFFICE 노출만 끊는 수단이다. */
  onToggleActive?: () => void
}

/**
 * 지사 생성/수정 폼. 지사명·주소·전화번호·상주인력(복수).
 * 상주인력은 임직원 원장에서 골라 담기만 한다 — 계정 생성은 MANAGEMENT 인사 관리가 소유한다.
 *
 * **OFFICE 지사 상세와 같은 구성이다**(2026-09-10) — 위에 지사 정보 카드, 아래에 상주인력이고
 * 사람 한 줄의 생김새도 같다. 갈리는 것은 고칠 수 있는가 하나뿐이라, 여기서는 상주인력이 결과
 * 목록 하나가 아니라 좌우 두 기둥(원장 / 이 지사)으로 선다.
 *
 * 창이 하나인 이유는 저장이 하나이기 때문이다. 상주인력을 별도 창으로 띄우면 담당자가 확인을
 * 두 번 누르게 되고, 안쪽 창의 '확인'이 저장인지 임시 반영인지 화면이 답하지 못한다.
 */
export function BranchFormModal({
  open,
  branch,
  memberIds,
  busy,
  onClose,
  onSubmit,
  onToggleActive,
}: Props) {
  const editing = Boolean(branch)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [err, setErr] = useState('')

  /**
   * 초기값을 다시 심는 기준은 **id 배열의 내용**이지 그 배열 자체가 아니다.
   *
   * 부모는 열려 있는 동안에도 다시 그려지고(원장 조회가 창 포커스마다 갱신된다) 그때마다 새
   * 배열이 내려온다. 배열을 그대로 의존성에 두면 내용이 같아도 초기화가 돌아, 담당자가 적던
   * 지사명과 방금 옮겨 놓은 상주인력이 저장도 하기 전에 지워진다.
   */
  const memberKey = memberIds.join(',')

  // 열릴 때마다 대상에 맞춰 초기화한다(상주인력 목록이 늦게 와도 그때 다시 채워진다).
  useEffect(() => {
    if (!open) return
    setName(branch?.name ?? '')
    setAddress(branch?.address ?? '')
    setPhone(branch?.phone ?? '')
    setMembers(memberKey ? memberKey.split(',') : [])
    setErr('')
  }, [open, branch, memberKey])

  const submit = () => {
    if (!name.trim()) return setErr('지사명을 입력하세요.')
    setErr('')
    onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      memberIds: members,
    })
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={onClose}
      title={editing ? '지사 수정' : '지사 등록'}
      size="3xl"
      sectioned
      footer={
        <>
          {/*
            비활성화는 저장과 성격이 다른 일(이 지사를 계속 쓸지)이라 확인/취소와 같은 무리에 두지
            않고 반대쪽 끝으로 민다 — 나란히 두면 저장하려다 누르는 자리가 된다.
          */}
          {editing && onToggleActive && (
            <Button
              variant={branch?.isActive ? 'outline-danger' : 'outline'}
              onClick={onToggleActive}
              disabled={busy}
              className="mr-auto"
            >
              {branch?.isActive ? '비활성화' : '활성화'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '생성'}
          </Button>
        </>
      }
    >
      <Card title="지사 정보">
        <div className="space-y-4">
          {/* 짧은 값 둘은 한 줄에 나란히, 주소는 길이의 상한을 몰라 전폭을 받는다(상세와 같은 배치). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="지사명" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 강남지사"
                autoFocus
              />
            </Field>
            <Field label="전화번호">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 02-1234-5678"
              />
            </Field>
          </div>

          <Field label="주소">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예: 서울특별시 강남구 테헤란로 123, 6층"
            />
          </Field>

          {/* 저장 실패는 어느 한 칸의 오류가 아니라 폼 전체의 결과라 마지막 줄에 선다. */}
          {err && <p className={formText.error}>{err}</p>}
        </div>
      </Card>

      <BranchMemberPanes value={members} onChange={setMembers} />
    </Modal>
  )
}
