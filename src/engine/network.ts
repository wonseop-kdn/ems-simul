import {
  BASE_MVA,
  BRANCHES,
  BUSES,
  LOAD_QP_RATIO,
  SLACK_BUS_ID,
} from './systemModel';
import type { BusType, OperatingState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
//  가압(Energized) 부분망 구성 + Ybus(G, B) 빌드
//  연결성 알고리즘: Slack 모선에서 도달 가능한 부분만 해석 대상으로 삼는다.
// ─────────────────────────────────────────────────────────────────────────────

export interface NetworkBranch {
  id: number;
  fromId: number;
  toId: number;
  fromLocal: number;
  toLocal: number;
  g: number; // 직렬 컨덕턴스
  b: number; // 직렬 서셉턴스 (리액턴스가 양이면 음수)
  limitMW: number;
  isTransformer: boolean;
}

export interface Network {
  n: number; // 가압 모선 수
  energized: number[]; // 가압 모선 id (local index 순서)
  local: Map<number, number>; // busId -> local index
  slackLocal: number;
  type: BusType[]; // local index 별 모선 타입
  vSet: number[]; // Slack/PV 전압 설정 (pu); PQ는 1.0
  pSched: number[]; // 스케줄 유효주입 (pu)
  qSched: number[]; // 스케줄 무효주입 (pu)
  G: number[][];
  B: number[][];
  branches: NetworkBranch[]; // 가압 부분망 내 통전 선로
  islanded: number[]; // 비가압(고립) 모선 id
}

/** Slack 으로부터 통전 가능한 모선 집합을 BFS 로 탐색 */
function findEnergized(breakers: Record<number, boolean>): Set<number> {
  const adj = new Map<number, number[]>();
  for (const bus of BUSES) adj.set(bus.id, []);
  for (const br of BRANCHES) {
    if (!breakers[br.id]) continue; // 차단기 개방 → 회로 단절
    adj.get(br.from)!.push(br.to);
    adj.get(br.to)!.push(br.from);
  }

  const seen = new Set<number>();
  const queue = [SLACK_BUS_ID];
  seen.add(SLACK_BUS_ID);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        queue.push(nxt);
      }
    }
  }
  return seen;
}

export function buildNetwork(state: OperatingState): Network {
  const energizedSet = findEnergized(state.breakers);
  const energized = BUSES.filter((b) => energizedSet.has(b.id)).map((b) => b.id);
  const islanded = BUSES.filter((b) => !energizedSet.has(b.id)).map((b) => b.id);

  const local = new Map<number, number>();
  energized.forEach((id, i) => local.set(id, i));
  const n = energized.length;

  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const B = Array.from({ length: n }, () => new Array(n).fill(0));
  const branches: NetworkBranch[] = [];

  for (const br of BRANCHES) {
    if (!state.breakers[br.id]) continue;
    if (!energizedSet.has(br.from) || !energizedSet.has(br.to)) continue;
    const denom = br.r * br.r + br.x * br.x;
    const g = br.r / denom;
    const b = -br.x / denom;
    const i = local.get(br.from)!;
    const j = local.get(br.to)!;
    G[i][i] += g;
    G[j][j] += g;
    G[i][j] -= g;
    G[j][i] -= g;
    B[i][i] += b;
    B[j][j] += b;
    B[i][j] -= b;
    B[j][i] -= b;
    branches.push({
      id: br.id,
      fromId: br.from,
      toId: br.to,
      fromLocal: i,
      toLocal: j,
      g,
      b,
      limitMW: br.limitMW,
      isTransformer: br.isTransformer,
    });
  }

  const type: BusType[] = new Array(n);
  const vSet = new Array(n).fill(1.0);
  const pSched = new Array(n).fill(0);
  const qSched = new Array(n).fill(0);

  for (const bus of BUSES) {
    if (!energizedSet.has(bus.id)) continue;
    const i = local.get(bus.id)!;
    type[i] = bus.type;
    if (bus.type === 'slack') {
      vSet[i] = state.slackVSet;
    } else if (bus.type === 'pv') {
      vSet[i] = state.pvVSet;
      pSched[i] = state.pvGenMW / BASE_MVA; // 발전 → 양의 주입
    } else {
      // PQ: 부하 모선이면 소비(음의 주입), 수집/배전 모선은 0
      const load = state.loads[bus.id] ?? 0;
      pSched[i] = -load / BASE_MVA;
      qSched[i] = (-load * LOAD_QP_RATIO) / BASE_MVA;
    }
  }

  return {
    n,
    energized,
    local,
    slackLocal: local.get(SLACK_BUS_ID)!,
    type,
    vSet,
    pSched,
    qSched,
    G,
    B,
    branches,
    islanded,
  };
}

/** 모선 i 의 계산 주입전력 (pu) */
export function busInjection(
  net: Network,
  V: number[],
  th: number[],
  i: number,
): [number, number] {
  let P = 0;
  let Q = 0;
  for (let j = 0; j < net.n; j++) {
    const ang = th[i] - th[j];
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    P += V[j] * (net.G[i][j] * cos + net.B[i][j] * sin);
    Q += V[j] * (net.G[i][j] * sin - net.B[i][j] * cos);
  }
  return [V[i] * P, V[i] * Q];
}
