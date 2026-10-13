// 장치 분류 (기획서 3장). 한 게임은 하나의 장치 분류에만 속한다.

export type DeviceId = 'mic' | 'camera' | 'xr' | 'gaze' | 'rhythm';

export interface DeviceInfo {
  id: DeviceId;
  icon: string;
  name: string;
  /** 탭 제목 옆 짧은 설명 */
  hint: string;
  /** 장치 안내 표에 쓰는 "쓰는 방법" */
  usage: string;
}

export const DEVICES: DeviceInfo[] = [
  { id: 'mic', icon: '🎤', name: '마이크', hint: '소리의 크기·길이·높이와 말로 조작해요', usage: '소리 크기·길이·높이, 단어 말하기' },
  { id: 'camera', icon: '📷', name: '카메라 모션', hint: '웹캠 앞에서 손과 몸을 움직여 조작해요', usage: '웹캠으로 손·전신 동작 인식' },
  { id: 'xr', icon: '🥽', name: 'VR·MR', hint: '헤드셋을 쓰고 그 공간 안에서 플레이해요', usage: 'VR·MR 헤드셋 + 양손 컨트롤러' },
  { id: 'gaze', icon: '👁️', name: '시선·햅틱', hint: '바라보는 곳으로 조작하고 몸으로 느껴요', usage: '시선 추적 + 햅틱 조끼 (체험판: 웹캠 + 패드 진동)' },
  { id: 'rhythm', icon: '🥁', name: '리듬·악기', hint: '드럼 패드나 건반을 박자에 맞춰 연주해요', usage: 'MIDI 드럼 패드·건반 (게임패드로 대체 가능)' },
];

export function findDevice(id: string): DeviceInfo | undefined {
  return DEVICES.find((d) => d.id === id);
}

export interface Support {
  ok: boolean;
  /** ok가 false일 때 보여 줄 이유, ok일 때는 덧붙일 참고 */
  reason?: string;
}

const UNSUPPORTED = '이 브라우저에서는 사용할 수 없어요';

/** 이 브라우저가 해당 장치를 지원하는지 (실제 권한 요청은 하지 않음) */
export function checkSupport(id: DeviceId): Support {
  const secure = window.isSecureContext;
  const hasMedia = !!navigator.mediaDevices?.getUserMedia;
  const needHttps: Support = { ok: false, reason: '보안 연결(HTTPS)에서만 사용할 수 있어요' };

  switch (id) {
    case 'mic':
      if (!secure) return needHttps;
      return hasMedia && 'AudioContext' in window ? { ok: true } : { ok: false, reason: UNSUPPORTED };
    case 'camera':
      if (!secure) return needHttps;
      return hasMedia ? { ok: true } : { ok: false, reason: UNSUPPORTED };
    case 'xr':
      // 실제 헤드셋 연결 여부는 장치 준비 화면에서 확인한다
      if (!('xr' in navigator)) return { ok: false, reason: '헤드셋 브라우저에서 열어 주세요' };
      if (!secure) return needHttps;
      return { ok: true, reason: '헤드셋이 연결되어 있어야 해요' };
    case 'gaze':
      // 정식판은 데스크톱 앱. 사이트에서는 웹캠 체험판만 실행
      if (!secure) return needHttps;
      return hasMedia ? { ok: true, reason: '사이트에서는 체험판만 할 수 있어요' } : { ok: false, reason: UNSUPPORTED };
    case 'rhythm':
      if ('requestMIDIAccess' in navigator) return { ok: true };
      if ('getGamepads' in navigator) return { ok: true, reason: 'MIDI는 크롬·엣지에서만 돼요. 게임패드로 대신할 수 있어요' };
      return { ok: false, reason: UNSUPPORTED };
  }
}
