import { runPowerFlow } from './powerflow';
import { BRANCHES, BRANCH_MAP, BUS_MAP, LOAD_BUS_IDS } from './systemModel';
import type { OperatingState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
//  N-1 상정고장 스크리닝
//  현재 투입 중인 각 선로를 하나씩 탈락시켜 계통 안전성을 평가한다.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContingencyCase {
  branchId: number;
  branchName: string;
  converged: boolean;
  islanded: boolean; // 탈락으로 고립(정전) 모선 발생 여부
  islandedBuses: number[];
  lostLoadMW: number; // 탈락으로 정전된 부하량
  lostGenOnly: boolean; // 발전만 탈락(부하 정전 없음)
  maxLoadingPct: number; // 잔여 계통 최대 선로 부하율
  worstBranchId: number | null;
  anyOverload: boolean;
  severity: 'safe' | 'warning' | 'critical';
}

export interface ContingencyReport {
  cases: ContingencyCase[];
  secure: boolean; // 모든 N-1 케이스가 안전(safe)한가
}

export function runContingencyAnalysis(
  state: OperatingState,
): ContingencyReport {
  const cases: ContingencyCase[] = [];

  for (const br of BRANCHES) {
    if (!state.breakers[br.id]) continue; // 이미 개방된 선로는 대상 외

    const trial: OperatingState = {
      ...state,
      breakers: { ...state.breakers, [br.id]: false },
    };
    const res = runPowerFlow(trial);

    let maxLoadingPct = 0;
    let worstBranchId: number | null = null;
    for (const r of Object.values(res.branches)) {
      if (r.energized && r.loadingPct > maxLoadingPct) {
        maxLoadingPct = r.loadingPct;
        worstBranchId = r.id;
      }
    }

    const islanded = res.islandedBuses.length > 0;
    const lostLoadBuses = res.islandedBuses.filter((id) =>
      LOAD_BUS_IDS.includes(id),
    );
    const lostLoadMW = lostLoadBuses.reduce(
      (s, id) => s + (state.loads[id] ?? 0),
      0,
    );
    const lostGenOnly =
      islanded &&
      lostLoadBuses.length === 0 &&
      res.islandedBuses.every((id) => BUS_MAP[id].category === 'generator');

    // 심각도 분류:
    //  critical → 미수렴 또는 부하 정전(load shedding) 발생
    //  warning  → 발전만 탈락(slack 보상) 또는 잔여 선로 과부하
    //  safe     → 무영향
    let severity: ContingencyCase['severity'] = 'safe';
    if (!res.converged || lostLoadMW > 0) {
      severity = 'critical';
    } else if (lostGenOnly || res.anyOverload) {
      severity = 'warning';
    }

    cases.push({
      branchId: br.id,
      branchName: BRANCH_MAP[br.id].name,
      converged: res.converged,
      islanded,
      islandedBuses: res.islandedBuses,
      lostLoadMW,
      lostGenOnly,
      maxLoadingPct,
      worstBranchId,
      anyOverload: res.anyOverload,
      severity,
    });
  }

  return {
    cases,
    secure: cases.every((c) => c.severity === 'safe'),
  };
}
