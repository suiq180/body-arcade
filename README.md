# 🕹️ 몸으로 아케이드

키보드·마우스 대신 **마이크, 카메라 모션, VR·MR 헤드셋, 시선 추적·햅틱, 리듬·악기 컨트롤러**로 플레이하는 브라우저 미니게임 사이트.

- 사이트: https://minimode.netlify.app
- 지금 플레이할 수 있는 게임: 「몸이 말을 안 들어!」 (웹캠 전신 동작)

## 실행

```bash
npm install
npm run dev
```

크롬·엣지에서 `http://localhost:5173` 을 연다. (카메라·마이크는 `localhost` 또는 HTTPS에서만 동작)

```bash
npm run build
```

배포용 결과물이 `dist/`에 생긴다.

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/게임추가가이드.md`](docs/게임추가가이드.md) | **조원용** — 내 컴퓨터 준비부터 게임 추가·올리기까지 |
| [`CLAUDE.md`](CLAUDE.md) | 프로젝트 기준 문서 (규칙·장치 분류·사이트 구조·개발 단계) |
| [`docs/제작과정.md`](docs/제작과정.md) | 지금까지의 제작 과정, 새 게임 추가 절차, 주의할 점 |
| [`docs/games/`](docs/games/) | 게임별 기획서 |

## 폴더

```
src/games/<게임ID>/   게임 하나 = 폴더 하나 (meta.ts + index.ts) — 자동 등록
src/games/_template/  새 게임 견본
src/input/            장치 어댑터 (카메라 포즈 등)
src/setup/            장치 준비 화면
src/shared/           결과 화면, 디버그 패널, 효과음 등 공용 코드
src/hub/              메인 화면
```
