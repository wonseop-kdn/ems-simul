import { useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import {
  runContingencyAnalysis,
  type ContingencyReport,
} from '../engine/contingency';
import type { OperatingState } from '../engine/types';
import { COLORS } from './visuals';

interface Props {
  state: OperatingState;
}

const SEV_STYLE: Record<string, { color: string; label: string }> = {
  safe: { color: '#34d399', label: '안전' },
  warning: { color: '#fbbf24', label: '주의' },
  critical: { color: '#f43f5e', label: '심각' },
};

export default function ContingencyPanel({ state }: Props) {
  const [report, setReport] = useState<ContingencyReport | null>(null);

  // state 변경 시 자동 무효화를 위해 메모된 실행기
  const run = useMemo(
    () => () => setReport(runContingencyAnalysis(state)),
    [state],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert size={15} className="text-rose-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          N-1 상정고장 해석
        </h3>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        투입 중인 각 선로를 하나씩 탈락시켜 계통 안전성을 스크리닝합니다. 방사형
        구조에서는 선로 탈락이 부하 정전 또는 발전 탈락을 유발할 수 있습니다.
      </p>

      <button
        onClick={run}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500/90 py-2 text-xs font-bold text-white transition hover:bg-rose-500"
      >
        <Zap size={14} /> N-1 스크리닝 실행
      </button>

      {report && (
        <>
          <div
            className="flex items-center gap-2 rounded-lg border p-2.5 text-[12px] font-semibold"
            style={{
              borderColor: report.secure ? '#34d39955' : '#f43f5e55',
              backgroundColor: report.secure ? '#34d39915' : '#f43f5e12',
              color: report.secure ? COLORS.flow : COLORS.overload,
            }}
          >
            {report.secure ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            {report.secure
              ? 'N-1 안전: 모든 단일고장 견딤'
              : 'N-1 취약: 일부 고장에 정전/과부하 발생'}
          </div>

          <div className="space-y-1.5">
            {report.cases.map((c) => {
              const sev = SEV_STYLE[c.severity];
              return (
                <div
                  key={c.branchId}
                  className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-slate-200">
                      {c.branchName} 탈락
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ color: sev.color, backgroundColor: `${sev.color}1f` }}
                    >
                      {sev.label}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[10.5px] text-slate-400">
                    {c.lostLoadMW > 0 && (
                      <div className="text-rose-300">
                        ⚠ 부하 정전 {c.lostLoadMW.toFixed(0)} MW (모선{' '}
                        {c.islandedBuses.join(', ')})
                      </div>
                    )}
                    {c.lostGenOnly && (
                      <div className="text-amber-300">
                        발전 탈락 (모선 {c.islandedBuses.join(', ')}) · Slack 보상
                      </div>
                    )}
                    {!c.islanded && c.converged && (
                      <div className="flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 size={11} /> 정전 없음
                      </div>
                    )}
                    {c.converged && !c.islanded && (
                      <div>
                        잔여 최대 부하율{' '}
                        <span
                          style={{
                            color: c.anyOverload ? COLORS.overload : COLORS.subtext,
                          }}
                        >
                          {c.maxLoadingPct.toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
