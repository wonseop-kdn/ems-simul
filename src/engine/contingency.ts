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

export interface AdviceItem {
  level: 'good' | 'warn' | 'critical';
  title: string;
  detail: string;
}

export interface ContingencyReport {
  cases: ContingencyCase[];
  secure: boolean; // 모든 N-1 케이스가 안전(safe)한가
  advice: AdviceItem[]; // 운영 권고(보강 방안) 멘트
}

/** N-1 결과를 바탕으로 설비 역할별 운영 권고를 생성 */
function generateAdvice(
  cases: ContingencyCase[],
  state: OperatingState,
): AdviceItem[] {
  const advice: AdviceItem[] = [];
  const critical = cases.filter((c) => c.severity === 'critical');
  const find = (id: number) => cases.find((c) => c.branchId === id);

  // 변압기(TR, 선로3) 단일 고장점
  const tr = find(3);
  if (tr && tr.severity === 'critical') {
    advice.push({
      level: 'critical',
      title: '주변압기(TR) 이중화 필요',
      detail: `변압기 1대에 전 부하(${tr.lostLoadMW.toFixed(0)}MW)가 매달려 있어, TR 고장 시 배전단(모선 7·3·4·5) 전체가 정전됩니다. 예비 변압기(2-뱅크) 병렬 설치로 단일 고장점을 제거하세요.`,
    });
  }

  // Slack 발전기 연계선로(선로1) 단일 고장점
  const slackTie = find(1);
  if (slackTie && slackTie.severity === 'critical') {
    advice.push({
      level: 'critical',
      title: 'Slack 발전기 연계선로 보강 필요',
      detail:
        'Slack(기준) 발전기가 단일 회선으로만 계통에 연결되어, 이 선로 탈락 시 기준 전원을 잃고 전 계통이 블랙아웃됩니다. 병렬 2회선화 또는 배전단에 예비 조정 발전기 확보를 권장합니다.',
    });
  }

  // 방사형 부하선로(선로4·5·6) 무우회로
  const radialLost = critical.filter(
    (c) => [4, 5, 6].includes(c.branchId) && c.lostLoadMW > 0,
  );
  if (radialLost.length > 0) {
    const totalRadial = radialLost.reduce((s, c) => s + c.lostLoadMW, 0);
    advice.push({
      level: 'warn',
      title: '방사형 부하선로 연계(루프화) 권장',
      detail: `부하 선로 ${radialLost.length}개가 우회로 없는 방사형이라, 각 선로 탈락 시 해당 수용가(누적 ${totalRadial.toFixed(0)}MW)가 즉시 정전됩니다. 인접 배전모선 간 연계선로(루프/예비선로)로 무정전 절체 경로를 확보하세요.`,
    });
  }

  // 잔여 계통 과부하
  const overloadCases = cases.filter((c) => c.anyOverload && !c.islanded);
  if (overloadCases.length > 0) {
    const worst = overloadCases.reduce((a, b) =>
      b.maxLoadingPct > a.maxLoadingPct ? b : a,
    );
    advice.push({
      level: 'warn',
      title: '상정고장 시 잔여 선로 과부하',
      detail: `${worst.branchName} 탈락 시 잔여 선로 부하율이 ${worst.maxLoadingPct.toFixed(0)}%까지 상승합니다. 부하 재배분 또는 선로 용량 증설로 N-1 여유를 확보하세요.`,
    });
  }

  // 발전 탈락(허용 가능) 안내
  const genOnly = cases.filter((c) => c.lostGenOnly);
  if (genOnly.length > 0) {
    advice.push({
      level: 'good',
      title: '발전 탈락은 Slack이 보상 가능',
      detail: `${genOnly
        .map((c) => c.branchName)
        .join(', ')} 탈락은 발전기만 분리되어 Slack 발전기가 부족분을 자동 충당합니다(부하 정전 없음). 단, Slack 예비력(여유 출력)이 충분한지는 확인이 필요합니다.`,
    });
  }

  if (advice.length === 0) {
    advice.push({
      level: 'good',
      title: 'N-1 안전 — 보강 불필요',
      detail:
        '모든 단일 설비 고장에 대해 정전·과부하가 발생하지 않습니다. 현 운전점은 N-1 신뢰도 기준을 만족합니다.',
    });
  }

  void state;
  return advice;
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
    advice: generateAdvice(cases, state),
  };
}
