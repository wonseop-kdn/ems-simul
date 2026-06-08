import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CircuitBoard,
  Gauge,
  LineChart,
  Radar,
  ShieldAlert,
  Sliders,
  Zap,
} from 'lucide-react';
import { runPowerFlow } from './engine/powerflow';
import { DEFAULT_STATE } from './engine/systemModel';
import type { OperatingState } from './engine/types';
import AnalysisPanel from './components/AnalysisPanel';
import BranchMonitor from './components/BranchMonitor';
import ContingencyPanel from './components/ContingencyPanel';
import ControlPanel from './components/ControlPanel';
import Diagram, { type HoverTarget } from './components/Diagram';
import StateEstimationPanel from './components/StateEstimationPanel';
import Tooltip from './components/Tooltip';
import { COLORS } from './components/visuals';

type Tab = 'control' | 'monitor' | 'analysis' | 'contingency' | 'se';

const TABS: { id: Tab; label: string; icon: typeof Sliders }[] = [
  { id: 'control', label: '운전 제어', icon: Sliders },
  { id: 'monitor', label: '선로 현황', icon: Activity },
  { id: 'analysis', label: '수렴·전압', icon: LineChart },
  { id: 'contingency', label: 'N-1 해석', icon: ShieldAlert },
  { id: 'se', label: '상태 추정', icon: Radar },
];

function StatChip({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm font-bold" style={{ color }}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<OperatingState>(() =>
    structuredClone(DEFAULT_STATE),
  );
  const [tab, setTab] = useState<Tab>('control');
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const result = useMemo(() => runPowerFlow(state), [state]);

  const setLoad = (busId: number, mw: number) =>
    setState((s) => ({ ...s, loads: { ...s.loads, [busId]: mw } }));
  const setPv = (mw: number) => setState((s) => ({ ...s, pvGenMW: mw }));
  const toggleBreaker = (id: number) =>
    setState((s) => ({
      ...s,
      breakers: { ...s.breakers, [id]: !s.breakers[id] },
    }));
  const reset = () => setState(structuredClone(DEFAULT_STATE));

  const onHover = (t: HoverTarget | null, p?: { x: number; y: number }) => {
    setHover(t);
    if (p) setPos(p);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200">
      {/* ── 헤더 대시보드 ─────────────────────────────────── */}
      <header className="z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <CircuitBoard size={22} className="text-cyan-400" />
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-100">
              EMS 실시간 전력계통 시뮬레이터
            </h1>
            <p className="text-[10px] leading-tight text-slate-500">
              Energy Management System · Power Flow & State Estimation
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* 수렴 상태 */}
          <div
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold"
            style={{
              borderColor: result.converged ? '#34d39955' : '#f43f5e55',
              backgroundColor: result.converged ? '#34d39912' : '#f43f5e12',
              color: result.converged ? COLORS.flow : COLORS.overload,
            }}
          >
            <Gauge size={13} />
            {result.converged ? '수렴 OK' : '발산'}
          </div>
          <StatChip
            label="총 발전"
            value={result.totalGenMW.toFixed(1)}
            unit="MW"
            color="#86efac"
          />
          <StatChip
            label="총 부하"
            value={result.totalLoadMW.toFixed(1)}
            unit="MW"
            color={COLORS.load}
          />
          <StatChip
            label="송전손실"
            value={result.totalLossMW.toFixed(2)}
            unit="MW"
            color="#38bdf8"
          />
          {result.anyOverload && (
            <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 animate-pulse-fast">
              <AlertTriangle size={13} /> 선로 과부하
            </div>
          )}
          {result.islandedBuses.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-300">
              <Zap size={13} /> 정전 모선 {result.islandedBuses.join(',')}
            </div>
          )}
        </div>
      </header>

      {/* ── 본문 ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* 다이어그램 */}
        <main className="relative min-w-0 flex-1">
          <Diagram
            result={result}
            onToggleBreaker={toggleBreaker}
            onHover={onHover}
            hover={hover}
          />
          {/* 범례 */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] backdrop-blur">
            <Legend color={COLORS.flow} label="통전/정상" />
            <Legend color={COLORS.flowHigh} label="고부하(>80%)" />
            <Legend color={COLORS.overload} label="과부하/정전" />
            <Legend color={COLORS.deEnergized} label="비통전" />
            <span className="text-slate-500">· 차단기 클릭 = 개폐</span>
          </div>
        </main>

        {/* 사이드바 */}
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-800 bg-slate-900/50">
          <nav className="flex border-b border-slate-800">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                    active
                      ? 'border-b-2 border-cyan-400 bg-slate-800/40 text-cyan-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'control' && (
              <ControlPanel
                state={state}
                result={result}
                onLoadChange={setLoad}
                onPvChange={setPv}
                onReset={reset}
              />
            )}
            {tab === 'monitor' && <BranchMonitor result={result} />}
            {tab === 'analysis' && <AnalysisPanel result={result} />}
            {tab === 'contingency' && <ContingencyPanel state={state} />}
            {tab === 'se' && <StateEstimationPanel state={state} />}
          </div>
        </aside>
      </div>

      <Tooltip hover={hover} pos={pos} result={result} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-slate-400">
      <span
        className="inline-block h-2 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
