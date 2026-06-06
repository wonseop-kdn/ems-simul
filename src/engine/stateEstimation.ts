import { invert, matMul, matVec, solveLinear, transpose } from './linalg';
import { buildNetwork, busInjection, type Network } from './network';
import { newtonRaphson } from './powerflow';
import { BASE_MVA, BUS_MAP } from './systemModel';
import type { OperatingState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
//  가중최소자승(WLS) 상태추정 + 불량데이터(Bad Data) 검출/식별
//
//  상태벡터 x = [ θ(slack 제외), V(전체) ]   (slack 위상각 = 0 기준)
//  계측 z     = { 모선전압, 유효/무효 주입, 선로 유효/무효 조류 } + 가우시안 노이즈
//  추정       : Gauss-Newton  Δx = (HᵀWH)⁻¹ Hᵀ W (z − h(x))
//  검출       : 목적함수 J(x) 의 카이제곱 검정
//  식별       : 최대정규화잔차(LNR) 시험
// ─────────────────────────────────────────────────────────────────────────────

export type MeasType = 'V' | 'Pinj' | 'Qinj' | 'Pflow' | 'Qflow';

interface MeasDef {
  type: MeasType;
  label: string;
  busLocal: number; // V/Pinj/Qinj 또는 flow 의 from
  toLocal?: number; // flow 의 to
  g?: number;
  b?: number;
  sigma: number; // 표준편차 (pu)
}

export interface MeasRow {
  label: string;
  type: MeasType;
  unit: string;
  sigma: number;
  trueVal: number; // 표시 단위 (pu 또는 MW/MVar)
  measured: number;
  estimated: number;
  residual: number;
  normResidual: number;
  injectedBad: boolean; // 인위적으로 주입한 불량데이터인가
  flagged: boolean; // LNR 시험으로 식별됨
}

export interface SEResult {
  ok: boolean;
  message?: string;
  converged: boolean;
  iterations: number;
  objectiveJ: number;
  chiThreshold: number;
  dof: number;
  badDataDetected: boolean;
  identifiedLabel: string | null;
  rows: MeasRow[];
  states: {
    busId: number;
    vTrue: number;
    vEst: number;
    thTrueDeg: number;
    thEstDeg: number;
  }[];
}

export interface SEOptions {
  withBadData: boolean;
  noiseScale?: number; // 노이즈 배율 (기본 1)
}

// ── 통계 유틸 ────────────────────────────────────────────────
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 표준정규 역함수 (Acklam 근사) */
function normInv(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pl = 0.02425;
  const ph = 1 - pl;
  let q: number;
  let r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= ph) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** 카이제곱 역함수 (Wilson-Hilferty 근사) */
function chi2inv(p: number, k: number): number {
  if (k <= 0) return 0;
  const z = normInv(p);
  const t = 1 - 2 / (9 * k) + z * Math.sqrt(2 / (9 * k));
  return k * t * t * t;
}

// ── 선로 from→to 조류 (pu) ───────────────────────────────────
function flowPQ(
  g: number,
  b: number,
  Vi: number,
  Vj: number,
  thi: number,
  thj: number,
): [number, number] {
  const a = thi - thj;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const p = g * Vi * Vi - Vi * Vj * (g * cos + b * sin);
  const q = -b * Vi * Vi - Vi * Vj * (g * sin - b * cos);
  return [p, q];
}

// ── 상태 → 전압/위상 디코드 ──────────────────────────────────
function decode(net: Network, x: number[]): { V: number[]; th: number[] } {
  const th = new Array(net.n).fill(0);
  const V = new Array(net.n).fill(1);
  let k = 0;
  for (let i = 0; i < net.n; i++) {
    if (i !== net.slackLocal) th[i] = x[k++];
  }
  for (let i = 0; i < net.n; i++) V[i] = x[k++];
  return { V, th };
}

function evalMeas(net: Network, defs: MeasDef[], x: number[]): number[] {
  const { V, th } = decode(net, x);
  return defs.map((m) => {
    switch (m.type) {
      case 'V':
        return V[m.busLocal];
      case 'Pinj':
        return busInjection(net, V, th, m.busLocal)[0];
      case 'Qinj':
        return busInjection(net, V, th, m.busLocal)[1];
      case 'Pflow':
        return flowPQ(m.g!, m.b!, V[m.busLocal], V[m.toLocal!], th[m.busLocal], th[m.toLocal!])[0];
      case 'Qflow':
        return flowPQ(m.g!, m.b!, V[m.busLocal], V[m.toLocal!], th[m.busLocal], th[m.toLocal!])[1];
    }
  });
}

/** 수치미분으로 계측 야코비안 H = ∂h/∂x */
function jacobian(net: Network, defs: MeasDef[], x: number[]): number[][] {
  const m = defs.length;
  const ns = x.length;
  const eps = 1e-6;
  const h0 = evalMeas(net, defs, x);
  const H = Array.from({ length: m }, () => new Array(ns).fill(0));
  for (let k = 0; k < ns; k++) {
    const xp = [...x];
    xp[k] += eps;
    const hp = evalMeas(net, defs, xp);
    for (let r = 0; r < m; r++) H[r][k] = (hp[r] - h0[r]) / eps;
  }
  return H;
}

export function runStateEstimation(
  state: OperatingState,
  opts: SEOptions,
): SEResult {
  const empty: SEResult = {
    ok: false,
    converged: false,
    iterations: 0,
    objectiveJ: 0,
    chiThreshold: 0,
    dof: 0,
    badDataDetected: false,
    identifiedLabel: null,
    rows: [],
    states: [],
  };

  const net = buildNetwork(state);
  if (net.n < 2) {
    return { ...empty, message: '가압된 모선이 부족하여 상태추정을 수행할 수 없습니다.' };
  }
  const truth = newtonRaphson(net);
  if (!truth.converged) {
    return { ...empty, message: '기준 조류해석이 수렴하지 않아 상태추정을 건너뜁니다.' };
  }

  // 참 상태벡터
  const xTrue: number[] = [];
  for (let i = 0; i < net.n; i++) if (i !== net.slackLocal) xTrue.push(truth.th[i]);
  for (let i = 0; i < net.n; i++) xTrue.push(truth.V[i]);

  // ── 계측 구성 ───────────────────────────────────────────
  const SV = 0.004; // 전압 σ (pu)
  const SP = 0.008; // 전력 σ (pu, ≈0.8MW/0.8MVar)
  const defs: MeasDef[] = [];

  for (let i = 0; i < net.n; i++) {
    defs.push({ type: 'V', label: `V${net.energized[i]}`, busLocal: i, sigma: SV });
  }
  for (let i = 0; i < net.n; i++) {
    if (i === net.slackLocal) continue; // slack 주입은 미지(평형) → 계측 제외
    defs.push({ type: 'Pinj', label: `P${net.energized[i]}`, busLocal: i, sigma: SP });
    defs.push({ type: 'Qinj', label: `Q${net.energized[i]}`, busLocal: i, sigma: SP });
  }
  for (const br of net.branches) {
    defs.push({
      type: 'Pflow',
      label: `P${br.fromId}-${br.toId}`,
      busLocal: br.fromLocal,
      toLocal: br.toLocal,
      g: br.g,
      b: br.b,
      sigma: SP,
    });
    defs.push({
      type: 'Qflow',
      label: `Q${br.fromId}-${br.toId}`,
      busLocal: br.fromLocal,
      toLocal: br.toLocal,
      g: br.g,
      b: br.b,
      sigma: SP,
    });
  }

  const m = defs.length;
  const ns = xTrue.length;
  const dof = m - ns;

  // ── 계측값 생성 (참값 + 노이즈) ─────────────────────────
  const noiseScale = opts.noiseScale ?? 1;
  const hTrue = evalMeas(net, defs, xTrue);
  const z = hTrue.map((v, i) => v + defs[i].sigma * noiseScale * randn());

  // 불량데이터 주입: 선로 조류 계측 중 하나에 큰 총오차(+gross error)
  let injectedIdx = -1;
  if (opts.withBadData) {
    const candidates = defs
      .map((d, i) => ({ d, i }))
      .filter((c) => c.d.type === 'Pflow');
    if (candidates.length) {
      injectedIdx = candidates[Math.floor(candidates.length / 2)].i;
      z[injectedIdx] += 0.45; // ≈ 45 MW 의 명백한 이상값
    }
  }

  // ── WLS Gauss-Newton 반복 ───────────────────────────────
  const Winv = defs.map((d) => d.sigma * d.sigma); // R = diag(σ²)
  const w = defs.map((d) => 1 / (d.sigma * d.sigma));

  let x = new Array(ns).fill(0);
  let k = 0;
  for (let i = 0; i < net.n; i++) if (i !== net.slackLocal) x[k++] = 0; // θ flat
  for (let i = 0; i < net.n; i++) x[k++] = 1.0; // V flat

  let converged = false;
  let iter = 0;
  let H: number[][] = [];
  for (iter = 0; iter < 30; iter++) {
    const hx = evalMeas(net, defs, x);
    const dz = z.map((zi, i) => zi - hx[i]);
    H = jacobian(net, defs, x);
    const Ht = transpose(H);
    // G = Hᵀ W H
    const HtW = Ht.map((row) => row.map((v, j) => v * w[j]));
    const G = matMul(HtW, H);
    const rhs = matVec(HtW, dz);
    let dx: number[];
    try {
      dx = solveLinear(G, rhs);
    } catch {
      break;
    }
    for (let i = 0; i < ns; i++) x[i] += dx[i];
    const maxdx = dx.reduce((s, v) => Math.max(s, Math.abs(v)), 0);
    if (maxdx < 1e-7) {
      converged = true;
      iter++;
      break;
    }
  }

  // ── 사후 분석: 잔차/정규화잔차/목적함수 ─────────────────
  const hEst = evalMeas(net, defs, x);
  const r = z.map((zi, i) => zi - hEst[i]);
  let J = 0;
  for (let i = 0; i < m; i++) J += w[i] * r[i] * r[i];

  // 잔차 공분산 Ω = R − H G⁻¹ Hᵀ
  const Ht = transpose(H);
  const HtW = Ht.map((row) => row.map((v, j) => v * w[j]));
  const G = matMul(HtW, H);
  let normR = new Array(m).fill(0);
  try {
    const Ginv = invert(G);
    const GinvHt = matMul(Ginv, Ht); // ns×m
    // Ω_ii = R_ii − (H GinvHt)_ii
    for (let i = 0; i < m; i++) {
      let hgh = 0;
      for (let kk = 0; kk < ns; kk++) hgh += H[i][kk] * GinvHt[kk][i];
      const omega = Math.max(Winv[i] - hgh, 1e-12);
      normR[i] = Math.abs(r[i]) / Math.sqrt(omega);
    }
  } catch {
    normR = r.map((ri, i) => Math.abs(ri) / defs[i].sigma);
  }

  // ── 불량데이터 검출/식별 ────────────────────────────────
  const chiThreshold = chi2inv(0.99, Math.max(dof, 1));
  const badDataDetected = J > chiThreshold;

  let identifiedIdx = -1;
  let maxNr = 0;
  for (let i = 0; i < m; i++) {
    if (normR[i] > maxNr) {
      maxNr = normR[i];
      identifiedIdx = i;
    }
  }
  const flaggedIdx = badDataDetected && maxNr > 3.0 ? identifiedIdx : -1;

  // ── 결과 패키징 (표시단위 변환) ─────────────────────────
  const { V: vEst, th: thEst } = decode(net, x);
  const toDisp = (type: MeasType, val: number) =>
    type === 'V' ? val : val * BASE_MVA;
  const unitOf = (type: MeasType) =>
    type === 'V' ? 'pu' : type.startsWith('P') ? 'MW' : 'MVar';

  const rows: MeasRow[] = defs.map((d, i) => ({
    label: d.label,
    type: d.type,
    unit: unitOf(d.type),
    sigma: d.type === 'V' ? d.sigma : d.sigma * BASE_MVA,
    trueVal: toDisp(d.type, hTrue[i]),
    measured: toDisp(d.type, z[i]),
    estimated: toDisp(d.type, hEst[i]),
    residual: toDisp(d.type, r[i]),
    normResidual: normR[i],
    injectedBad: i === injectedIdx,
    flagged: i === flaggedIdx,
  }));

  const states = net.energized.map((busId, i) => ({
    busId,
    vTrue: truth.V[i],
    vEst: vEst[i],
    thTrueDeg: (truth.th[i] * 180) / Math.PI,
    thEstDeg: (thEst[i] * 180) / Math.PI,
  }));

  // 표시 순서를 모선 번호 기준으로 보기 좋게 정렬하지 않고 구성 순서 유지
  void BUS_MAP;

  return {
    ok: true,
    converged,
    iterations: iter,
    objectiveJ: J,
    chiThreshold,
    dof: Math.max(dof, 0),
    badDataDetected,
    identifiedLabel: flaggedIdx >= 0 ? defs[flaggedIdx].label : null,
    rows,
    states,
  };
}
