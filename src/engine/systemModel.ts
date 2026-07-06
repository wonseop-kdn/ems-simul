import type { BranchDef, BusDef, OperatingState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
//  계통 모델 정의
//  구조: [Slack G] [PV G] ─→ (모선6 수집) ═TR═ (모선7 배전) ─→ 부하 3 / 4 / 5
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_MVA = 100; // 계통 기준용량
export const LOAD_PF = 0.95; // 부하 역률(지상)
export const LOAD_QP_RATIO = Math.tan(Math.acos(LOAD_PF)); // Q/P 비율 ≈ 0.3287

// SVG 캔버스 좌표계
export const CANVAS = { width: 1000, height: 600 };

export const BUSES: BusDef[] = [
  {
    id: 1,
    name: 'Bus 1',
    type: 'slack',
    role: 'Slack 발전기 모선 (Swing) · 계통 수급 균형 기준',
    category: 'generator',
    x: 150,
    y: 165,
    baseKV: 345,
    vSet: 1.05,
  },
  {
    id: 2,
    name: 'Bus 2',
    type: 'pv',
    role: 'PV 발전기 모선 · 유효출력(P) 고정 운전',
    category: 'generator',
    x: 150,
    y: 435,
    baseKV: 345,
    vSet: 1.05,
  },
  {
    id: 6,
    name: 'Bus 6',
    type: 'pq',
    role: '발전기 수집/집전 모선 (Collector Hub) · 소비 0',
    category: 'collector',
    x: 380,
    y: 300,
    baseKV: 345,
  },
  {
    id: 7,
    name: 'Bus 7',
    type: 'pq',
    role: '변압기 2차측 변전 모선 (Secondary Substation) · 소비 0',
    category: 'distribution',
    x: 640,
    y: 300,
    baseKV: 154,
  },
  {
    id: 3,
    name: 'Bus 3',
    type: 'pq',
    role: '부하 수용가 모선 3 (Radial Customer)',
    category: 'load',
    x: 885,
    y: 150,
    baseKV: 154,
  },
  {
    id: 4,
    name: 'Bus 4',
    type: 'pq',
    role: '부하 수용가 모선 4 (Radial Customer)',
    category: 'load',
    x: 885,
    y: 300,
    baseKV: 154,
  },
  {
    id: 5,
    name: 'Bus 5',
    type: 'pq',
    role: '부하 수용가 모선 5 (Radial Customer)',
    category: 'load',
    x: 885,
    y: 450,
    baseKV: 154,
  },
];

export const BRANCHES: BranchDef[] = [
  { id: 1, name: '선로 1', from: 1, to: 6, r: 0.0015, x: 0.015, limitMW: 500, isTransformer: false },
  { id: 2, name: '선로 2', from: 2, to: 6, r: 0.0015, x: 0.015, limitMW: 500, isTransformer: false },
  { id: 3, name: '변압기 TR', from: 6, to: 7, r: 0.001, x: 0.04, limitMW: 200, isTransformer: true },
  { id: 4, name: '선로 4', from: 7, to: 3, r: 0.02, x: 0.10, limitMW: 160, isTransformer: false },
  { id: 5, name: '선로 5', from: 7, to: 4, r: 0.02, x: 0.10, limitMW: 160, isTransformer: false },
  { id: 6, name: '선로 6', from: 7, to: 5, r: 0.02, x: 0.10, limitMW: 160, isTransformer: false },
];

/** 부하 제어 대상 모선 (수집/배전 모선은 제외) */
export const LOAD_BUS_IDS = [3, 4, 5];

export const SLACK_BUS_ID = 1;
export const PV_BUS_ID = 2;

export const BUS_MAP: Record<number, BusDef> = Object.fromEntries(
  BUSES.map((b) => [b.id, b]),
);
export const BRANCH_MAP: Record<number, BranchDef> = Object.fromEntries(
  BRANCHES.map((b) => [b.id, b]),
);

export const DEFAULT_STATE: OperatingState = {
  loads: { 3: 30, 4: 25, 5: 35 },
  pvGenMW: 50,
  pvVSet: 1.05,
  slackVSet: 1.05,
  breakers: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
};

/** 슬라이더 범위 */
export const LIMITS = {
  load: { min: 0, max: 110, step: 1 },
  pvGen: { min: 0, max: 160, step: 1 },
};
