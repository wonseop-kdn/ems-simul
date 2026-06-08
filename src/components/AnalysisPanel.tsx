import { Activity, TrendingDown } from 'lucide-react';
import { BUSES } from '../engine/systemModel';
import type { SolveResult } from '../engine/types';
import { COLORS, voltageColor } from './visuals';

// ─────────────────────────────────────────────────────────────────────────────
//  분석 패널: ① NR 수렴 추이 차트  ② 전압 프로파일 차트
// ─────────────────────────────────────────────────────────────────────────────

/** 모선을 전기적 거리 순서(Slack→집전→배전→부하)로 정렬 */
const PROFILE_ORDER = [1, 2, 6, 7, 3, 4, 5];

function NRConvergenceChart({ result }: { result: SolveResult }) {
  const hist = result.mismatchHistory;
  if (hist.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        수렴 데이터가 없습니다 (계통 미가압 또는 미수렴).
      </p>
    );
  }

  // 로그 스케일: max mismatch가 3.0 → 1e-13 까지 변하므로 log10 사용
  const W = 300;
  const H = 150;
  const padL = 38;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const logs = hist.map((p) => Math.log10(Math.max(p.max, 1e-15)));
  const yTop = 1; // log10(10) 상단 여유
  const yBot = -14; // log10(1e-14) 하단
  const xOf = (i: number) =>
    padL + (hist.length === 1 ? plotW / 2 : (i / (hist.length - 1)) * plotW);
  const yOf = (lg: number) =>
    padT + ((yTop - lg) / (yTop - yBot)) * plotH;

  const linePath = hist
    .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(logs[i])}`)
    .join(' ');

  // y축 눈금 (10^k)
  const yTicks = [0, -3, -6, -9, -12];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 수렴 허용오차 선 (1e-8) */}
        <line
          x1={padL}
          x2={W - padR}
          y1={yOf(-8)}
          y2={yOf(-8)}
          stroke={COLORS.flow}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        <text x={W - padR} y={yOf(-8) - 3} fontSize={7} fill={COLORS.flow} textAnchor="end">
          수렴 기준 1e-8
        </text>

        {/* y축 눈금 */}
        {yTicks.map((k) => (
          <g key={k}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(k)}
              y2={yOf(k)}
              stroke={COLORS.grid}
              strokeWidth={0.5}
            />
            <text x={padL - 4} y={yOf(k) + 3} fontSize={7} fill={COLORS.subtext} textAnchor="end">
              1e{k}
            </text>
          </g>
        ))}

        {/* x축 라벨 */}
        {hist.map((h, i) => (
          <text
            key={i}
            x={xOf(i)}
            y={H - padB + 14}
            fontSize={7.5}
            fill={COLORS.subtext}
            textAnchor="middle"
          >
            iter{h.iter}
          </text>
        ))}

        {/* mismatch 곡선 */}
        <path d={linePath} fill="none" stroke={COLORS.slack} strokeWidth={1.8} />

        {/* 점 + 값 */}
        {hist.map((h, i) => (
          <g key={i}>
            <circle cx={xOf(i)} cy={yOf(logs[i])} r={3} fill={COLORS.slack} />
            <text
              x={xOf(i)}
              y={yOf(logs[i]) - 6}
              fontSize={6.5}
              fill={COLORS.text}
              textAnchor="middle"
            >
              {h.max < 1e-3 ? h.max.toExponential(0) : h.max.toFixed(2)}
            </text>
          </g>
        ))}
      </svg>

      {/* 반복별 상세 */}
      <div className="mt-2 space-y-1">
        {hist.map((h) => (
          <div
            key={h.iter}
            className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1 text-[10px]"
          >
            <span className="font-mono text-slate-400">iter {h.iter}</span>
            <span className="font-mono text-cyan-300">
              {h.max.toExponential(2)} pu
            </span>
            <span className="text-slate-500">
              최대 Δ{h.kind} @ Bus{h.bus}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoltageProfileChart({ result }: { result: SolveResult }) {
  const ordered = PROFILE_ORDER.map((id) => ({
    def: BUSES.find((b) => b.id === id)!,
    res: result.buses[id],
  })).filter((x) => x.res);

  const energized = ordered.filter((x) => x.res.energized);
  if (energized.length === 0) {
    return <p className="text-xs text-slate-500">가압된 모선이 없습니다.</p>;
  }

  const W = 300;
  const H = 160;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const vMin = 0.9;
  const vMax = 1.08;
  const xOf = (i: number) =>
    padL + (ordered.length === 1 ? plotW / 2 : (i / (ordered.length - 1)) * plotW);
  const yOf = (v: number) =>
    padT + ((vMax - v) / (vMax - vMin)) * plotH;

  // 가압 모선만 이어진 선 (정전 구간은 끊김)
  const segments: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  ordered.forEach((x, i) => {
    if (x.res.energized) {
      cur.push({ i, v: x.res.vMag });
    } else if (cur.length) {
      segments.push(cur);
      cur = [];
    }
  });
  if (cur.length) segments.push(cur);

  const vTicks = [0.94, 0.96, 1.0, 1.05];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 저전압 경보 영역 (<0.94) */}
        <rect
          x={padL}
          y={yOf(0.94)}
          width={plotW}
          height={H - padB - yOf(0.94)}
          fill={COLORS.overload}
          opacity={0.07}
        />

        {/* y축 눈금 */}
        {vTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke={v === 1.0 ? COLORS.subtext : COLORS.grid}
              strokeWidth={v === 1.0 ? 0.8 : 0.5}
              strokeDasharray={v === 1.0 ? '0' : '3 3'}
            />
            <text x={padL - 4} y={yOf(v) + 3} fontSize={7} fill={COLORS.subtext} textAnchor="end">
              {v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* 전압 프로파일 선 */}
        {segments.map((seg, si) => (
          <path
            key={si}
            d={seg.map((p, k) => `${k === 0 ? 'M' : 'L'} ${xOf(p.i)} ${yOf(p.v)}`).join(' ')}
            fill="none"
            stroke={COLORS.slack}
            strokeWidth={1.8}
          />
        ))}

        {/* 모선 점 + 전압값 + 라벨 */}
        {ordered.map((x, i) => {
          const en = x.res.energized;
          const color = en ? voltageColor(x.res.vMag, true) : COLORS.deEnergized;
          return (
            <g key={x.def.id}>
              {en ? (
                <>
                  <circle cx={xOf(i)} cy={yOf(x.res.vMag)} r={3.5} fill={color} />
                  <text
                    x={xOf(i)}
                    y={yOf(x.res.vMag) - 7}
                    fontSize={7}
                    fill={color}
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {x.res.vMag.toFixed(3)}
                  </text>
                </>
              ) : (
                <text
                  x={xOf(i)}
                  y={padT + plotH / 2}
                  fontSize={7}
                  fill={COLORS.overload}
                  textAnchor="middle"
                >
                  정전
                </text>
              )}
              {/* x축 라벨 */}
              <text
                x={xOf(i)}
                y={H - padB + 13}
                fontSize={7.5}
                fill={COLORS.subtext}
                textAnchor="middle"
              >
                B{x.def.id}
              </text>
              <text
                x={xOf(i)}
                y={H - padB + 23}
                fontSize={6}
                fill={COLORS.subtext}
                textAnchor="middle"
              >
                {x.def.baseKV}kV
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[10px] text-slate-500">
        Slack(발전) → 집전 → 배전 → 부하 순. 전기적으로 멀어질수록 전압이 강하됩니다.
        붉은 영역(&lt;0.94pu)은 저전압 경보 구간.
      </p>
    </div>
  );
}

export default function AnalysisPanel({ result }: { result: SolveResult }) {
  const vList = PROFILE_ORDER.map((id) => result.buses[id]).filter(
    (b) => b?.energized,
  );
  const vmin = vList.length ? Math.min(...vList.map((b) => b.vMag)) : 0;
  const vmax = vList.length ? Math.max(...vList.map((b) => b.vMag)) : 0;

  return (
    <div className="space-y-5">
      {/* ── NR 수렴 추이 ─────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <TrendingDown size={16} className="text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-200">NR 수렴 추이</h3>
          <span
            className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: result.converged ? '#34d39918' : '#f43f5e18',
              color: result.converged ? COLORS.flow : COLORS.overload,
            }}
          >
            {result.converged
              ? `${result.iterations}회 만에 수렴`
              : '발산'}
          </span>
        </div>
        <p className="mb-2 text-[10px] text-slate-500">
          Newton-Raphson 반복마다 최대 전력 불일치(mismatch)가 줄어드는 모습.
          세로축은 로그 스케일 — 오차가 매 반복 제곱으로 작아지는{' '}
          <span className="text-cyan-400">이차수렴</span>을 보여줍니다.
        </p>
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-2">
          <NRConvergenceChart result={result} />
        </div>
      </section>

      {/* ── 전압 프로파일 ─────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Activity size={16} className="text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-200">전압 프로파일</h3>
          {vList.length > 0 && (
            <span className="ml-auto font-mono text-[10px] text-slate-400">
              최고 {vmax.toFixed(3)} / 최저{' '}
              <span style={{ color: voltageColor(vmin, true) }}>
                {vmin.toFixed(3)}
              </span>{' '}
              pu
            </span>
          )}
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-2">
          <VoltageProfileChart result={result} />
        </div>
      </section>
    </div>
  );
}
