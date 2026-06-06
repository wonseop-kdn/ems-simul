import { BRANCH_MAP, BUS_MAP } from '../engine/systemModel';
import type { SolveResult } from '../engine/types';
import type { HoverTarget } from './Diagram';
import { busStatusLabel, COLORS, fmt, fmtSigned } from './visuals';

interface Props {
  hover: HoverTarget | null;
  pos: { x: number; y: number };
  result: SolveResult;
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex justify-between gap-6 text-[11px]">
      <span className="text-slate-400">{k}</span>
      <span className="font-mono font-semibold" style={{ color: color ?? '#e2e8f0' }}>
        {v}
      </span>
    </div>
  );
}

export default function Tooltip({ hover, pos, result }: Props) {
  if (!hover) return null;

  const style: React.CSSProperties = {
    left: Math.min(pos.x + 16, window.innerWidth - 250),
    top: Math.min(pos.y + 16, window.innerHeight - 220),
  };

  let title = '';
  let subtitle = '';
  let rows: React.ReactNode = null;

  if (hover.kind === 'bus') {
    const def = BUS_MAP[hover.id];
    const r = result.buses[hover.id];
    title = `${def.name} · ${def.type.toUpperCase()}`;
    subtitle = def.role;
    rows = (
      <>
        <Row
          k="상태"
          v={busStatusLabel(r)}
          color={r.energized ? COLORS.flow : COLORS.overload}
        />
        <Row k="전압 크기" v={`${fmt(r.vMag, 4)} pu`} />
        <Row k="위상각" v={`${fmtSigned(r.vAngle, 2)}°`} />
        <Row k="정격 전압" v={`${def.baseKV} kV`} />
        {def.category === 'generator' && (
          <>
            <Row k="발전 P" v={`${fmt(r.pGen, 1)} MW`} color="#86efac" />
            <Row k="발전 Q" v={`${fmt(r.qGen, 1)} MVar`} color="#86efac" />
          </>
        )}
        {def.category === 'load' && (
          <>
            <Row k="부하 P" v={`${fmt(r.pLoad, 1)} MW`} color={COLORS.load} />
            <Row k="부하 Q" v={`${fmt(r.qLoad, 1)} MVar`} color={COLORS.load} />
          </>
        )}
        <Row k="순주입 P" v={`${fmtSigned(r.pInj, 1)} MW`} />
        <Row k="순주입 Q" v={`${fmtSigned(r.qInj, 1)} MVar`} />
      </>
    );
  } else {
    const def = BRANCH_MAP[hover.id];
    const r = result.branches[hover.id];
    title = `${def.name}${def.isTransformer ? ' (변압기)' : ''}`;
    subtitle = `모선 ${def.from} → 모선 ${def.to}`;
    rows = (
      <>
        <Row
          k="차단기"
          v={r.closed ? '투입 (CLOSED)' : '개방 (OPEN)'}
          color={r.closed ? COLORS.flow : COLORS.overload}
        />
        <Row
          k="통전"
          v={r.energized ? '통전 중' : '비통전'}
          color={r.energized ? COLORS.flow : COLORS.deEnergized}
        />
        <Row
          k="유효조류"
          v={`${fmt(r.pFrom, 1)} MW (${r.flowDir === 1 ? '→' : r.flowDir === -1 ? '←' : '·'})`}
        />
        <Row k="무효조류" v={`${fmt(r.qFrom, 1)} MVar`} />
        <Row k="피상전력" v={`${fmt(r.sFrom, 1)} MVA`} />
        <Row
          k="부하율"
          v={`${fmt(r.loadingPct, 1)} %`}
          color={r.overloaded ? COLORS.overload : r.loadingPct > 80 ? COLORS.flowHigh : COLORS.flow}
        />
        <Row k="열적한계" v={`${def.limitMW} MW`} />
        <Row k="손실 P" v={`${fmt(r.pLoss, 2)} MW`} />
        <Row k="임피던스" v={`R=${def.r} X=${def.x}`} />
      </>
    );
  }

  return (
    <div
      className="pointer-events-none fixed z-50 w-[230px] rounded-xl border border-slate-700/70 bg-slate-900/95 p-3 shadow-2xl backdrop-blur"
      style={style}
    >
      <div className="mb-0.5 text-sm font-bold text-slate-100">{title}</div>
      <div className="mb-2 text-[10px] leading-tight text-slate-400">{subtitle}</div>
      <div className="space-y-1">{rows}</div>
    </div>
  );
}
