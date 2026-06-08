import { solveLinear } from './linalg';
import { buildNetwork, busInjection, type Network } from './network';
import {
  BASE_MVA,
  BRANCHES,
  BUS_MAP,
  LOAD_QP_RATIO,
} from './systemModel';
import type {
  BranchResult,
  BusResult,
  OperatingState,
  SolveResult,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
//  Newton-Raphson 전력조류 해석
// ─────────────────────────────────────────────────────────────────────────────

interface NRSolution {
  V: number[];
  th: number[]; // rad
  converged: boolean;
  iterations: number;
  maxMismatch: number;
  /** 반복별 최대 불일치 추이 (iter0, iter1, …) */
  mismatchHistory: { iter: number; max: number; bus: number; kind: 'P' | 'Q' }[];
}

export function newtonRaphson(net: Network, maxIter = 50, tol = 1e-8): NRSolution {
  const { n, slackLocal, type, vSet } = net;

  const V = new Array(n).fill(1.0);
  const th = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (type[i] === 'slack' || type[i] === 'pv') V[i] = vSet[i];
  }

  // 미지수 인덱스: 각도(slack 제외), 전압(PQ 만)
  const angleIdx: number[] = [];
  const voltIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i !== slackLocal) angleIdx.push(i);
    if (type[i] === 'pq') voltIdx.push(i);
  }
  const na = angleIdx.length;
  const nv = voltIdx.length;
  const dim = na + nv;

  let converged = dim === 0;
  let iter = 0;
  let maxMismatch = 0;
  const mismatchHistory: NRSolution['mismatchHistory'] = [];

  for (iter = 0; iter < maxIter && !converged; iter++) {
    // 1) 계산 주입 & 불일치
    const Pc = new Array(n).fill(0);
    const Qc = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const [p, q] = busInjection(net, V, th, i);
      Pc[i] = p;
      Qc[i] = q;
    }

    const mismatch = new Array(dim).fill(0);
    for (let a = 0; a < na; a++) {
      const i = angleIdx[a];
      mismatch[a] = net.pSched[i] - Pc[i];
    }
    for (let v = 0; v < nv; v++) {
      const i = voltIdx[v];
      mismatch[na + v] = net.qSched[i] - Qc[i];
    }

    // 최대 불일치 성분의 위치(어느 모선의 P인지 Q인지) 추적
    let mmMax = 0;
    let mmIdx = 0;
    for (let k = 0; k < dim; k++) {
      if (Math.abs(mismatch[k]) > mmMax) {
        mmMax = Math.abs(mismatch[k]);
        mmIdx = k;
      }
    }
    maxMismatch = mmMax;
    const mmKind: 'P' | 'Q' = mmIdx < na ? 'P' : 'Q';
    const mmLocal = mmIdx < na ? angleIdx[mmIdx] : voltIdx[mmIdx - na];
    mismatchHistory.push({
      iter,
      max: mmMax,
      bus: net.energized[mmLocal],
      kind: mmKind,
    });

    if (maxMismatch < tol) {
      converged = true;
      break;
    }

    // 2) 야코비안 [H N; M L]
    const J = Array.from({ length: dim }, () => new Array(dim).fill(0));
    const Gm = net.G;
    const Bm = net.B;

    const dPdth = (i: number, j: number): number => {
      if (i === j) return -Qc[i] - Bm[i][i] * V[i] * V[i];
      const ang = th[i] - th[j];
      return V[i] * V[j] * (Gm[i][j] * Math.sin(ang) - Bm[i][j] * Math.cos(ang));
    };
    const dPdV = (i: number, j: number): number => {
      if (i === j) return Pc[i] / V[i] + Gm[i][i] * V[i];
      const ang = th[i] - th[j];
      return V[i] * (Gm[i][j] * Math.cos(ang) + Bm[i][j] * Math.sin(ang));
    };
    const dQdth = (i: number, j: number): number => {
      if (i === j) return Pc[i] - Gm[i][i] * V[i] * V[i];
      const ang = th[i] - th[j];
      return -V[i] * V[j] * (Gm[i][j] * Math.cos(ang) + Bm[i][j] * Math.sin(ang));
    };
    const dQdV = (i: number, j: number): number => {
      if (i === j) return Qc[i] / V[i] - Bm[i][i] * V[i];
      const ang = th[i] - th[j];
      return V[i] * (Gm[i][j] * Math.sin(ang) - Bm[i][j] * Math.cos(ang));
    };

    for (let a = 0; a < na; a++) {
      const i = angleIdx[a];
      for (let aa = 0; aa < na; aa++) J[a][aa] = dPdth(i, angleIdx[aa]);
      for (let vv = 0; vv < nv; vv++) J[a][na + vv] = dPdV(i, voltIdx[vv]);
    }
    for (let v = 0; v < nv; v++) {
      const i = voltIdx[v];
      for (let aa = 0; aa < na; aa++) J[na + v][aa] = dQdth(i, angleIdx[aa]);
      for (let vv = 0; vv < nv; vv++) J[na + v][na + vv] = dQdV(i, voltIdx[vv]);
    }

    // 3) 보정량 적용
    let dx: number[];
    try {
      dx = solveLinear(J, mismatch);
    } catch {
      return { V, th, converged: false, iterations: iter + 1, maxMismatch, mismatchHistory };
    }
    for (let a = 0; a < na; a++) th[angleIdx[a]] += dx[a];
    for (let v = 0; v < nv; v++) V[voltIdx[v]] += dx[na + v];
  }

  return { V, th, converged, iterations: iter, maxMismatch, mismatchHistory };
}

/** 통전 선로의 양단 조류(pu) 계산 */
function branchPower(
  br: { g: number; b: number },
  Vi: number,
  Vj: number,
  thi: number,
  thj: number,
): { pij: number; qij: number; pji: number; qji: number } {
  const { g, b } = br;
  const a = thi - thj;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pij = g * Vi * Vi - Vi * Vj * (g * cos + b * sin);
  const qij = -b * Vi * Vi - Vi * Vj * (g * sin - b * cos);
  // to→from (각도 반전)
  const pji = g * Vj * Vj - Vi * Vj * (g * cos - b * sin);
  const qji = -b * Vj * Vj - Vi * Vj * (-g * sin - b * cos);
  return { pij, qij, pji, qji };
}

export function runPowerFlow(state: OperatingState): SolveResult {
  const net = buildNetwork(state);
  const sol = newtonRaphson(net);

  const buses: Record<number, BusResult> = {};
  const branches: Record<number, BranchResult> = {};

  // ── 모선 결과 ──────────────────────────────────────────────
  for (const bus of Object.values(BUS_MAP)) {
    const li = net.local.get(bus.id);
    if (li === undefined || !sol.converged) {
      // 비가압 또는 미수렴 → 정전 처리
      const load =
        bus.type === 'pq' && bus.category === 'load'
          ? state.loads[bus.id] ?? 0
          : 0;
      buses[bus.id] = {
        id: bus.id,
        energized: false,
        vMag: 0,
        vAngle: 0,
        pGen: 0,
        qGen: 0,
        pLoad: li === undefined ? 0 : load,
        qLoad: 0,
        pInj: 0,
        qInj: 0,
      };
      continue;
    }

    const [pCalc, qCalc] = busInjection(net, sol.V, sol.th, li);
    const pInjMW = pCalc * BASE_MVA;
    const qInjMVar = qCalc * BASE_MVA;

    // 부하 모선만 소비전력 보유 (발전기/수집/배전 모선 부하 = 0)
    const pLoad = bus.category === 'load' ? state.loads[bus.id] ?? 0 : 0;
    const qLoad = pLoad * LOAD_QP_RATIO;

    // 순주입 = 발전 − 부하  ⇒  발전 = 순주입 + 부하 (발전기 모선만 유효)
    const isGen = bus.category === 'generator';
    const pGen = isGen ? pInjMW + pLoad : 0;
    const qGen = isGen ? qInjMVar + qLoad : 0;

    buses[bus.id] = {
      id: bus.id,
      energized: true,
      vMag: sol.V[li],
      vAngle: (sol.th[li] * 180) / Math.PI,
      pGen,
      qGen,
      pLoad,
      qLoad,
      pInj: pInjMW,
      qInj: qInjMVar,
    };
  }

  // ── 선로 결과 ──────────────────────────────────────────────
  let anyOverload = false;
  for (const brDef of BRANCHES) {
    const closed = !!state.breakers[brDef.id];
    const netBr = net.branches.find((b) => b.id === brDef.id);
    const energized = closed && netBr !== undefined && sol.converged;

    if (!energized || !netBr) {
      branches[brDef.id] = {
        id: brDef.id,
        closed,
        energized: false,
        pFrom: 0,
        qFrom: 0,
        pTo: 0,
        qTo: 0,
        pLoss: 0,
        qLoss: 0,
        sFrom: 0,
        loadingPct: 0,
        overloaded: false,
        flowDir: 0,
        flowMW: 0,
      };
      continue;
    }

    const i = netBr.fromLocal;
    const j = netBr.toLocal;
    const { pij, qij, pji, qji } = branchPower(
      netBr,
      sol.V[i],
      sol.V[j],
      sol.th[i],
      sol.th[j],
    );
    const pFrom = pij * BASE_MVA;
    const qFrom = qij * BASE_MVA;
    const pTo = pji * BASE_MVA;
    const qTo = qji * BASE_MVA;
    const sFrom = Math.hypot(pFrom, qFrom);
    const sTo = Math.hypot(pTo, qTo);
    const sMax = Math.max(sFrom, sTo);
    const loadingPct = (sMax / brDef.limitMW) * 100;
    const overloaded = loadingPct > 100;
    if (overloaded) anyOverload = true;

    branches[brDef.id] = {
      id: brDef.id,
      closed,
      energized: true,
      pFrom,
      qFrom,
      pTo,
      qTo,
      pLoss: pFrom + pTo,
      qLoss: qFrom + qTo,
      sFrom,
      loadingPct,
      overloaded,
      flowDir: pFrom >= 0 ? 1 : -1,
      flowMW: Math.abs(pFrom),
    };
  }

  // ── 집계 ──────────────────────────────────────────────────
  let totalGenMW = 0;
  let totalLoadMW = 0;
  for (const b of Object.values(buses)) {
    if (!b.energized) continue;
    totalGenMW += b.pGen;
    totalLoadMW += b.pLoad;
  }
  let totalLossMW = 0;
  for (const br of Object.values(branches)) {
    if (br.energized) totalLossMW += br.pLoss;
  }

  return {
    converged: sol.converged,
    iterations: sol.iterations,
    maxMismatch: sol.maxMismatch,
    mismatchHistory: sol.mismatchHistory,
    buses,
    branches,
    totalGenMW,
    totalLoadMW,
    totalLossMW,
    energizedBuses: net.energized,
    islandedBuses: net.islanded,
    anyOverload,
  };
}
