/**
 * API 키 저장소는 services/tauriAdapter.ts의 macOS Keychain 경로로 통합됐다.
 * 이 호환 함수들은 새 코드가 localStorage에 비밀을 다시 쓰지 못하게 막는다.
 */
export const saveOpenAiApiKey = (_apiKey: string): never => {
  throw new Error('OpenAI API 키는 설정 화면에서 macOS Keychain에 저장해주세요.');
};

export const loadOpenAiApiKey = (): null => null;

export const removeOpenAiApiKey = (): void => {
  // 레거시 값 삭제는 Keychain 이관 성공을 확인한 tauriAdapter만 수행한다.
};
