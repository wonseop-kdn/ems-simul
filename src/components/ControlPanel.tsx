import { Gauge, RotateCcw, Sliders, Zap } from 'lucide-react';
import { BUS_MAP, LIMITS, LOAD_BUS_IDS, PV_BUS_ID } from '../engine/systemModel';
import type { OperatingState, SolveResult } from '../engine/types';
import { voltageColor } from './visuals';

interface Props {
  state: OperatingState;
  result: SolveResult;
  onLoadChange: (busId: number, mw: number) => void;
  onPvChange: (mw: number) => void;
  onReset: () => void;
}

function Slider({
  label,
  sub,
  value,
  min,
  max,
  step,
  unit,
  accent,
  rightInfo,
  onChange,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  accent: string;
  rightInfo?: React.ReactNode;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-slate-100">{label}</div>
          <div className="text-[10px] text-slate-400">{sub}</div>
        </div>
        <div className="text-right">
          <span className="font-mono text-base font-bold" style={{ color: accent }}>
            {value}
          </span>
          <span className="ml-1 text-[10px] text-slate-400">{unit}</span>
          {rightInfo && <div className="text-[10px]">{rightInfo}</div>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: accent }}
      />
    </div>
  );
}

export default function ControlPanel({
  state,
  result,
  onLoadChange,
  onPvChange,
  onReset,
}: Props) {
  return (
    <div className="space-y-4">
      {/* 부하 제어 */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Sliders size={15} className="text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            부하 제어 · Load Control
          </h3>
        </div>
        <div className="space-y-2.5">
          {LOAD_BUS_IDS.map((id) => {
            const bus = BUS_MAP[id];
            const r = result.buses[id];
            return (
              <Slider
                key={id}
                label={`${bus.name} 수용가 부하`}
                sub={`모선 ${id} · ${bus.baseKV}kV 배전`}
                value={state.loads[id] ?? 0}
                min={LIMITS.load.min}
                max={LIMITS.load.max}
                step={LIMITS.load.step}
                unit="MW"
                accent="#f59e0b"
                rightInfo={
                  <span
                    className="font-mono"
                    style={{ color: voltageColor(r.vMag, r.energized) }}
                  >
                    {r.energized ? `${r.vMag.toFixed(3)}pu` : '정전'}
                  </span>
                }
                onChange={(v) => onLoadChange(id, v)}
              />
            );
          })}
        </div>
      </section>

      {/* 발전 제어 */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Zap size={15} className="text-violet-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            발전 출력 제어 · Generation
          </h3>
        </div>
        <Slider
          label="PV 발전기 유효출력"
          sub={`모선 ${PV_BUS_ID} · 전압제어 발전기`}
          value={state.pvGenMW}
          min={LIMITS.pvGen.min}
          max={LIMITS.pvGen.max}
          step={LIMITS.pvGen.step}
          unit="MW"
          accent="#a78bfa"
          onChange={onPvChange}
        />
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
          <Gauge size={15} className="shrink-0 text-cyan-400" />
          <div className="text-[11px] leading-tight text-slate-300">
            <span className="font-semibold text-cyan-300">Slack 발전기(모선 1)</span>
            가 수급 불균형(
            <span className="font-mono text-emerald-300">
              {(result.totalLoadMW + result.totalLossMW - state.pvGenMW).toFixed(1)} MW
            </span>
            )를 자동 충당합니다.
          </div>
        </div>
      </section>

      <button
        onClick={onReset}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600/60 bg-slate-800/50 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-700/60"
      >
        <RotateCcw size={14} /> 기본 운전점으로 초기화
      </button>
    </div>
  );
}
