// 앱 전역 디자인 토큰. 신규 UI는 여기 상수를 가져다 써서 분산을 막는다.
// 오렌지 = primary / emerald = ready / amber = partial·modified / red = error

export const FOCUS_RING = 'focus:outline-none focus:ring-1 focus:ring-orange-500';
export const FOCUS_RING_2 = 'focus:outline-none focus:ring-2 focus:ring-orange-500';

export const BTN_PRIMARY =
  'bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors ' +
  FOCUS_RING_2;

export const BTN_SECONDARY =
  'bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium px-4 py-2 rounded-lg transition-colors ' +
  FOCUS_RING_2;

export const BTN_GHOST =
  'bg-transparent text-orange-400 border border-orange-500/50 hover:bg-orange-500/10 font-medium px-4 py-2 rounded-lg transition-colors ' +
  FOCUS_RING_2;

// 상태/의미 색상 체계
//   ready/success → emerald  (완료)
//   partial/modified/warning → amber  (주의/진행중)
//   error → red
//   info → blue  (UI 관례, orange(=primary)와 혼동 방지)
//   primary/accent/focus → orange  (기본 액션)
export const STATUS = {
  ready: 'text-emerald-400',
  success: 'text-emerald-400',
  partial: 'text-amber-400',
  modified: 'text-amber-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  primary: 'text-orange-400',
} as const;

export const STATUS_BG = {
  ready: 'bg-emerald-500',
  success: 'bg-emerald-500',
  partial: 'bg-amber-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  primary: 'bg-orange-500',
} as const;

export const INPUT_BASE =
  'bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 transition-colors ' +
  FOCUS_RING;

export const MODAL_OVERLAY = 'fixed inset-0 bg-black/85 backdrop-blur-sm z-50';
export const MODAL_CONTAINER =
  'bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl';

export const TYPO = {
  modalTitle: 'text-lg font-black tracking-tight',
  sectionHeader: 'text-sm font-semibold text-zinc-200',
  label: 'text-xs font-medium text-zinc-400 uppercase tracking-wider',
  body: 'text-sm text-zinc-300',
  helper: 'text-xs text-zinc-500',
} as const;
