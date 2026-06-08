// ─────────────────────────────────────────────────────────────────────────────
//  EMS 시뮬레이터 도메인 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

export type BusType = 'slack' | 'pv' | 'pq';
export type BusCategory = 'generator' | 'collector' | 'distribution' | 'load';

/** 모선(Bus) 정적 정의 */
export interface BusDef {
  id: number; // 물리적 모선 번호 (1,2,3,4,5,6,7)
  name: string;
  type: BusType;
  role: string; // 전력공학적 역할 설명
  category: BusCategory;
  x: number; // SVG 좌표
  y: number;
  baseKV: number; // 정격 전압 레벨 (kV)
  vSet?: number; // Slack/PV 모선 전압 설정값 (pu)
}

/** 선로/변압기(Branch) 정적 정의 */
export interface BranchDef {
  id: number;
  name: string;
  from: number; // from 모선 id
  to: number; // to 모선 id
  r: number; // 직렬 저항 (pu)
  x: number; // 직렬 리액턴스 (pu)
  limitMW: number; // 열적 한계 (MVA/MW)
  isTransformer: boolean;
}

/** 운전 상태(제어 입력) */
export interface OperatingState {
  loads: Record<number, number>; // 부하 모선 id -> 소비 유효전력(MW)
  pvGenMW: number; // PV 발전기(모선 2) 유효출력 (MW)
  pvVSet: number; // PV 발전기 전압 설정값 (pu)
  slackVSet: number; // Slack 발전기 전압 설정값 (pu)
  breakers: Record<number, boolean>; // 선로 id -> 차단기 투입(closed) 여부
}

/** 모선 해석 결과 */
export interface BusResult {
  id: number;
  energized: boolean;
  vMag: number; // pu
  vAngle: number; // degree
  pGen: number; // MW
  qGen: number; // MVar
  pLoad: number; // MW
  qLoad: number; // MVar
  pInj: number; // 순주입 MW (= Gen - Load)
  qInj: number; // 순주입 MVar
}

/** 선로 해석 결과 */
export interface BranchResult {
  id: number;
  closed: boolean; // 차단기 투입 여부
  energized: boolean; // 실제 통전 여부 (양단 가압 & 차단기 투입)
  pFrom: number;
  qFrom: number;
  pTo: number;
  qTo: number;
  pLoss: number;
  qLoss: number;
  sFrom: number; // |S| from단 (MVA)
  loadingPct: number;
  overloaded: boolean;
  flowDir: 1 | -1 | 0; // 1: from→to, -1: to→from
  flowMW: number; // 조류 크기 (MW)
}

/** NR 반복별 최대 불일치 기록 */
export interface MismatchPoint {
  iter: number;
  max: number; // pu
  bus: number; // 최대 불일치가 발생한 모선 id
  kind: 'P' | 'Q'; // 유효/무효 전력 불일치
}

/** 전체 해석 결과 */
export interface SolveResult {
  converged: boolean;
  iterations: number;
  maxMismatch: number;
  mismatchHistory: MismatchPoint[];
  buses: Record<number, BusResult>;
  branches: Record<number, BranchResult>;
  totalGenMW: number;
  totalLoadMW: number;
  totalLossMW: number;
  energizedBuses: number[];
  islandedBuses: number[];
  anyOverload: boolean;
}
