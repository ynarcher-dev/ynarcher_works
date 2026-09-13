/**
 * 사업 워크스페이스 설정의 **검증용 대역**.
 *
 * 실물은 Provider를 타고 게스트 호스트 설정까지 끌고 오지만, 파일받기 화면이 이 설정에서 읽는
 * 값은 권한 판정 키 하나(`key`)다. 대역은 그 하나만 세운다.
 */
export function useProgramWorkspace() {
  return { key: 'AC' as const, label: 'PROJECT', categories: [] as { value: string; label: string }[] }
}
