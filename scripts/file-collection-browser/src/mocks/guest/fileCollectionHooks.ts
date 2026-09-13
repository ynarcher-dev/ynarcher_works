/**
 * GUEST 파일받기 훅의 **검증용 대역**.
 *
 * 실물은 게스트 스토어(계정·사업 맥락)와 Supabase를 함께 물고, 작업 결과가 **아직 이 화면의
 * 일인가**를 `useScopeGuard`로 가른다. 대역에서는 맥락이 갈릴 일이 없으므로 가드는 늘 참이며,
 * 통신은 없다. 화면이 읽는 칸의 모양만 같게 맞춘다.
 */
import type { UploadCandidate, UploadOutcome } from '@guest/features/fileCollectionService'
import type {
  FileCollectionAssignmentDto,
  FileCollectionCommentDto,
  FileCollectionDto,
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
} from '@ynarcher/master-data'
import { useMemo } from 'react'
import {
  assignments,
  comments,
  files,
  nodes,
  publishedCollection,
  responses,
} from '../../appFixtures'
import { mutation, query, scenario } from '../scenario'

export interface FileCollectionScope {
  userId: string | null
  contextType: string | null
  contextId: string | null
  moduleId: string | null
  key: (string | null)[]
  token: string
}

export interface ScopeGuard {
  isActive: () => boolean
}

export class FileCollectionTooManyRowsError extends Error {}

export function loadErrorMessage(_errors: readonly unknown[], fallback: string): string {
  return fallback
}

export function useFileCollectionScope(moduleId: string | undefined): FileCollectionScope {
  return useMemo(
    () => ({
      userId: 'usr-0',
      // 맥락 키는 워크스페이스 이름이 아니라 사업의 `entityKey`이며 **소문자**다
      // (`guestStore.program.entityKey` — 'program' / 'fund' / 'mna'). 대문자로 두면 이
      // 대역만 실제 화면과 다른 키를 들고 서게 된다.
      contextType: 'program',
      contextId: 'prog-1',
      moduleId: moduleId ?? null,
      key: ['guest', 'file-collection', 'usr-0', 'program', 'prog-1', moduleId ?? null],
      token: `usr-0|program|prog-1|${moduleId ?? ''}`,
    }),
    [moduleId],
  )
}

export function useScopeGuard(_scope: FileCollectionScope): ScopeGuard {
  return { isActive: () => true }
}

/** 내 배정 — 한 게스트는 자기 배정 하나만 본다(다른 사람의 진행은 조회되지 않는다). */
const myAssignment: FileCollectionAssignmentDto = assignments.find((a) => a.id === 'asg-0')!

/** 내 응답 칸들. 상태를 골고루 깔아 두어 미제출·임시·제출·보완요청·승인이 한 화면에 선다. */
const myResponses: FileCollectionResponseDto[] = responses.filter((r) => r.assignment_id === 'asg-0')

export function useFileCollection(_scope: FileCollectionScope) {
  return query<FileCollectionDto | null>(scenario.empty ? null : publishedCollection)
}

export function useMyAssignment(_scope: FileCollectionScope, _collectionId: string | undefined) {
  return query<FileCollectionAssignmentDto | null>(scenario.unassigned ? null : myAssignment)
}

export function useCollectionNodes(_scope: FileCollectionScope, _collectionId: string | undefined) {
  return query<FileCollectionNodeDto[]>(nodes)
}

export function useMyResponses(_scope: FileCollectionScope, _assignmentId: string | undefined) {
  return query<FileCollectionResponseDto[]>(myResponses)
}

/*
  파일·코멘트 조회는 **응답 칸 하나를 두고** 나간다(실물은 `response_id`로 거른 질의다).
  대역이 전부를 돌려주면 다른 문항의 파일이 이 문항에 서고, 회차 계산(`questionControls`)이
  남의 줄까지 세어 화면이 실제와 다른 상태로 선다.
*/
export function useResponseFiles(_scope: FileCollectionScope, responseId: string | undefined) {
  return query<FileCollectionFileDto[]>(
    responseId ? files.filter((f) => f.response_id === responseId) : [],
  )
}

export function useResponseComments(_scope: FileCollectionScope, responseId: string | undefined) {
  return query<FileCollectionCommentDto[]>(
    responseId ? comments.filter((c) => c.response_id === responseId) : [],
  )
}

/*
  올리기·재확인의 인자와 결과는 실물 서비스 계약(`fileCollectionService`)을 **그대로 빌려 쓴다**
  — 타입만 가져오므로(`import type`) 이 대역에 통신이 따라 들어오지 않는다. 결과 모양을 손으로
  적어 두면 실패 사유 칸(`reason`)이 빠져, 화면의 재확인·제거 자리가 실제와 다르게 선다.
*/
export function useUploadFiles(_scope: FileCollectionScope) {
  return mutation<{ responseId: string; files: readonly UploadCandidate[] }, UploadOutcome[]>([])
}

export function useCommitPendingFile(_scope: FileCollectionScope) {
  return mutation<string, UploadOutcome>({
    ok: true,
    fileName: '표본.pdf',
    fileId: 'file-b-r2-pending',
  })
}

export function useRemoveFile(_scope: FileCollectionScope) {
  return mutation<string, void>(undefined)
}

export function useSubmitResponse(_scope: FileCollectionScope) {
  return mutation<string, void>(undefined)
}

export function useAddComment(_scope: FileCollectionScope) {
  return mutation<{ responseId: string; body: string }, void>(undefined)
}

export function useDownloadCollectionFile(_scope: FileCollectionScope) {
  return mutation<string, { delivered: boolean }>({ delivered: true })
}
