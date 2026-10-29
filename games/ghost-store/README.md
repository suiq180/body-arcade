# 귀신도 편의점에 옵니다 — 3D 웹게임

## 설치 및 실행 (Windows PowerShell)
1. Node.js LTS 설치: https://nodejs.org/
2. 압축을 풀고 VS Code에서 `ghost-convenience-3d` 폴더 열기
3. 터미널에서 다음 실행:

```powershell
npm.cmd install
npm.cmd run dev
```

4. 터미널에 표시되는 주소(일반적으로 http://localhost:5173)를 브라우저에서 열기

## 조작
- 키보드: ← → 선택 / ↑ CCTV / ↓ 손전등 / Z 계산 / X 퇴치 / C CCTV / V 손전등 / Enter 선택 실행
- 아케이드 조이스틱: 좌우 레버로 선택, 위아래로 CCTV/손전등, 기본 버튼 1~4는 계산/퇴치/CCTV/손전등
- **조이스틱 설정**에서 버튼을 눌러 물리 버튼을 재지정할 수 있음
- USB 조이스틱이 키보드 장치로 인식되는 경우도 키 지정 가능
- 브라우저 Gamepad API를 사용하므로 연결 후 버튼을 한 번 눌러야 감지될 수 있음

## 현재 구현 범위
- 바닥 타일·오염 PBR 맵, 금속 와이어 진열대와 상품, 냉장 쇼케이스, 유리 출입문, 외부 골목, 실내 환경 반사를 포함한 Three.js 매장
- 실물 POS 계산대, 와이어 진열대, 피부·의상 텍스처가 포함된 인체 GLB를 GLTFLoader로 불러옵니다. 다운로드한 모델은 `public/assets/`에 포함되어 오프라인 빌드에서도 사용됩니다.
- 시작 화면, 검정·짙은 갈색·붉은색 포인트의 심야 HUD, 낡은 벽/바닥 질감과 비네팅, CCTV 오버레이/타임코드/간헐적 노이즈, 드문 형광등 깜빡임
- Web Audio로 합성하는 형광등·냉장고 저음, 출입문 차임과 발소리. AUDIO 버튼으로 끌 수 있습니다.
- 기존 손님 판별, 계산/퇴치, 매출·멘탈, 8분 타이머, CCTV/손전등, 키보드 및 Gamepad 입력과 버튼 설정
- 백업: `backups/2026-10-20-pre-redesign/` (변경 전 소스, 진입 HTML, 의존성 매니페스트)

## 외부 리소스 및 라이선스
- `concrete_floor_worn_001` PBR 맵 (diffuse, OpenGL normal, roughness, displacement): [Poly Haven](https://polyhaven.com/a/concrete_floor_worn_001), Dimitrios Savva 및 Rico Cilliers, CC0 1.0. 바닥 맵은 2K JPG로 포함됩니다.
- 실물 POS/계산대: [Innerscene - Checkout counter with POS](https://www.innerscene.com/tools/library/3d-parts/checkout-counter-with-pos-original-retail-fixture-3fcfb566), CC0 1.0, 2.440 × 0.940 × 1.335 m.
- 와이어 진열대: [Innerscene - Wire shelving with casters](https://www.innerscene.com/tools/library/3d-parts/wire-shelving-with-casters-f3d7a7e6), CC0 1.0, 0.885 × 0.490 × 1.800 m.
- 사람 모델: [Innerscene - Daniel, 3D person](https://www.innerscene.com/tools/library/3d-parts/daniel-3d-person-standing-casual-f788af5a), MakeHuman CC0 자산 기반, CC0 1.0. 내장 텍스처를 1K로 축소해 포함했습니다.
- Innerscene 라이브러리 이용 조건: [CC0 library terms](https://www.innerscene.com/tools/library/terms). 상표가 포함된 원본은 사용하지 않았습니다.

## 다음 개발 단계
- 현재 사람 GLB는 정지 포즈이며 골격/걷기 클립이 없습니다. 여섯 손님은 동일 인체 모델의 변형을 재사용하고 이동 중 루트 흔들림을 적용하므로, 독립적인 실사 인물과 자연스러운 보행 리깅은 미완성입니다.
- 냉장고, 상품, 골목 건물·가로등은 절차적 임시 모델이며, 실물 사진측량 자산이 아닙니다. 소매 공간의 세부 상품/브랜드 모델도 추가 작업이 필요합니다.
- 합성 환경음은 실제 녹음 효과음이 아닙니다. 정전·점프 스케어·사라진 손님의 흔적·엔딩 분기는 미완성입니다.
- CCTV/그림자/대사 단서의 정답 일치 보장, 1레버·2버튼 전체 조작 흐름과 입력 테스트 화면, 브라우저/실기기 Gamepad 호환성 검증이 남아 있습니다.
