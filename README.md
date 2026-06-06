# EMS · 실시간 전력계통 모니터링 & 상태추정 시뮬레이터

실제 국가 송배전망과 유사한 위상(Topology)을 가진 **단일 뷰(Single-view) EMS 시뮬레이터**입니다.
Newton-Raphson 전력조류 해석 엔진과 WLS 상태추정을 탑재하고, SVG 기반 다크테마 GUI로
실시간 계통 운전을 모의합니다.

🔗 **Live Demo**: https://wonseop-kdn.github.io/ems-simul/

## 계통 구조 (Single-Line Diagram)

```
 [Slack G] 모선1 ─선로1─┐
                        ├─→ 모선6 ═══TR(변압기)═══ 모선7 ─선로4─→ 모선3 (부하)
 [ PV  G ] 모선2 ─선로2─┘   (수집/집전)            (배전)  ├─선로5─→ 모선4 (부하)
                                                          └─선로6─→ 모선5 (부하)
```

| 모선 | 타입 | 역할 |
|------|------|------|
| 1 | Slack | 계통 수급 균형 기준 (V=1.05pu, θ=0°) |
| 2 | PV | 전압제어 발전기 (P 고정) |
| 6 | PQ | 발전기 수집/집전 모선 (소비 0) |
| 7 | PQ | 변압기 2차측 배전 모선 (소비 0) |
| 3·4·5 | PQ | 방사형 부하 수용가 |

## 핵심 기능

- **⚡ 실시간 조류해석** — Newton-Raphson 솔버로 전압·위상각·선로조류·부하율 계산
- **🔌 연결성 알고리즘** — 차단기 개폐에 따른 계통 고립(Islanding)·정전 판정
- **🎛️ 운전 제어** — 부하(모선 3·4·5)·PV 발전 출력 슬라이더, 차단기 클릭 개폐
- **🛡️ N-1 상정고장 해석** — 단일 선로 탈락 시 정전/과부하 스크리닝
- **📡 WLS 상태추정** — 노이즈·불량데이터 주입 → 최소자승 복원 + χ² / 최대정규화잔차(LNR) 불량데이터 검출·식별
- **✨ SVG 시각화** — 조류 이동 입자, 과부하 맥동, 변압기 심볼, 실시간 툴팁

## 기술 스택

React 18 · TypeScript · Vite · Tailwind CSS · Lucide-React

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 미리보기
```

## 아키텍처

```
src/
├── engine/                  # 순수 연산부 (UI 비의존)
│   ├── systemModel.ts       # 모선·선로 정의, 기본 운전점
│   ├── network.ts           # 가압 부분망 + Ybus 빌드, 연결성
│   ├── powerflow.ts         # Newton-Raphson 조류해석
│   ├── contingency.ts       # N-1 상정고장 해석
│   ├── stateEstimation.ts   # WLS 상태추정 + 불량데이터 검출
│   └── linalg.ts            # 경량 선형대수
└── components/              # SVG 캔버스 + 제어 패널
    ├── Diagram.tsx · BusNode.tsx · BranchLine.tsx
    ├── ControlPanel.tsx · BranchMonitor.tsx
    ├── ContingencyPanel.tsx · StateEstimationPanel.tsx
    └── Tooltip.tsx
```
