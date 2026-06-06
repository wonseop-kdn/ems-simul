import { Activity } from 'lucide-react';
import { BRANCHES } from '../engine/systemModel';
import type { SolveResult } from '../engine/types';
import { COLORS, loadingBarColor } from './visuals';

interface Props {
  result: SolveResult;
}

export default function BranchMonitor({ result }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={15} className="text-emerald-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          선로 조류 현황 · Branch Flows
        </h3>
      </div>

      <div className="space-y-2">
        {BRANCHES.map((def) => {
          const r = result.branches[def.id];
          const pct = Math.min(r.loadingPct, 130);
          return (
            <div
              key={def.id}
              className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-200">
                  {def.name}
                  <span className="ml-1 text-slate-500">
                    ({def.from}→{def.to})
                  </span>
                </span>
                <span
                  className="font-mono font-bold"
                  style={{
                    color: r.energized
                      ? r.overloaded
                        ? COLORS.overload
                        : '#cbd5e1'
                      : COLORS.deEnergized,
                  }}
                >
                  {r.energized ? `${r.flowMW.toFixed(1)} MW` : 'OPEN'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-900/80">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${r.energized ? (pct / 130) * 100 : 0}%`,
                    backgroundColor: loadingBarColor(r.loadingPct),
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9.5px] text-slate-400">
                <span>한계 {def.limitMW}MW</span>
                <span
                  style={{
                    color: r.overloaded ? COLORS.overload : COLORS.subtext,
                    fontWeight: r.overloaded ? 700 : 400,
                  }}
                >
                  부하율 {r.energized ? r.loadingPct.toFixed(0) : 0}%
                  {r.overloaded ? ' ⚠ 과부하' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
