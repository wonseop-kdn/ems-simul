import { useId } from 'react';
import type { BranchDef, BranchResult } from '../engine/types';
import { COLORS, loadingColor } from './visuals';

interface Pt {
  x: number;
  y: number;
}

interface Props {
  def: BranchDef;
  result: BranchResult;
  from: Pt;
  to: Pt;
  hovered: boolean;
  onToggleBreaker: (id: number) => void;
  onHover: (id: number | null, evt?: React.MouseEvent) => void;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export default function BranchLine({
  def,
  result,
  from,
  to,
  hovered,
  onToggleBreaker,
  onHover,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const pathId = `flowpath-${def.id}-${uid}`;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nx = -dy / length; // 단위 법선
  const ny = dx / length;

  const color = loadingColor(result);
  const energized = result.energized;
  const closed = result.closed;

  // 차단기/변압기 위치
  const breakerT = def.isTransformer ? 0.76 : 0.5;
  const breaker = lerp(from, to, breakerT);
  const trCenter = lerp(from, to, 0.46);

  const pathD = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  // 조류 입자
  const particleCount = energized
    ? Math.max(2, Math.round(length / 72))
    : 0;
  const dur = Math.max(1.1, 3.0 - result.loadingPct * 0.018);
  const reverse = result.flowDir === -1;

  return (
    <g
      onMouseEnter={(e) => onHover(def.id, e)}
      onMouseMove={(e) => onHover(def.id, e)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* 숨은 모션 경로 */}
      <path id={pathId} d={pathD} fill="none" stroke="none" />

      {/* 글로우 underlay */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={energized ? (hovered ? 11 : 8) : 4}
        strokeLinecap="round"
        opacity={energized ? 0.16 : 0.08}
      />

      {/* 본선 */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={energized ? color : COLORS.deEnergized}
        strokeWidth={hovered ? 3.4 : 2.4}
        strokeLinecap="round"
        strokeDasharray={energized ? undefined : '7 7'}
        opacity={energized ? 0.95 : 0.55}
      />

      {/* 과부하 맥동 */}
      {result.overloaded && (
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={COLORS.overload}
          strokeWidth={6}
          strokeLinecap="round"
          className="animate-pulse-fast"
          opacity={0.7}
        />
      )}

      {/* 조류 이동 입자 */}
      {energized &&
        result.flowMW > 0.3 &&
        Array.from({ length: particleCount }).map((_, i) => (
          <circle
            key={i}
            r={result.overloaded ? 3.2 : 2.6}
            fill={result.overloaded ? '#fecaca' : '#ecfeff'}
          >
            <animateMotion
              dur={`${dur}s`}
              begin={`${(i / particleCount) * dur}s`}
              repeatCount="indefinite"
              keyPoints={reverse ? '1;0' : '0;1'}
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        ))}

      {/* 변압기 심볼 (8자 형태 + TR) */}
      {def.isTransformer && (
        <g
          opacity={energized ? 1 : 0.5}
          transform={`translate(${trCenter.x} ${trCenter.y})`}
        >
          <g transform={`rotate(${angleDeg})`}>
            <circle
              cx={-9}
              cy={0}
              r={12}
              fill="none"
              stroke={energized ? color : COLORS.deEnergized}
              strokeWidth={2.2}
            />
            <circle
              cx={9}
              cy={0}
              r={12}
              fill="none"
              stroke={energized ? color : COLORS.deEnergized}
              strokeWidth={2.2}
            />
          </g>
          <text
            x={0}
            y={-22}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={energized ? color : COLORS.deEnergized}
            style={{ letterSpacing: '0.05em' }}
          >
            TR
          </text>
        </g>
      )}

      {/* 차단기 (Breaker) — 클릭하여 개폐 */}
      <g
        transform={`translate(${breaker.x} ${breaker.y}) rotate(${angleDeg})`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleBreaker(def.id);
        }}
      >
        <rect
          x={-9}
          y={-9}
          width={18}
          height={18}
          rx={3}
          fill={closed ? '#0b1220' : '#1f1115'}
          stroke={closed ? color : COLORS.overload}
          strokeWidth={2.2}
        />
        {closed ? (
          <rect x={-4.5} y={-4.5} width={9} height={9} rx={1.5} fill={color} />
        ) : (
          // 개방 상태: 빗금
          <g stroke={COLORS.overload} strokeWidth={2.2} strokeLinecap="round">
            <line x1={-4.5} y1={-4.5} x2={4.5} y2={4.5} />
            <line x1={-4.5} y1={4.5} x2={4.5} y2={-4.5} />
          </g>
        )}
      </g>

      {/* 선로 라벨 (조류량/부하율) */}
      {energized && (
        <text
          x={lerp(from, to, def.isTransformer ? 0.3 : 0.5).x + nx * 16}
          y={lerp(from, to, def.isTransformer ? 0.3 : 0.5).y + ny * 16}
          textAnchor="middle"
          fontSize={9.5}
          fill={result.overloaded ? COLORS.overload : COLORS.subtext}
          fontWeight={result.overloaded ? 700 : 500}
          style={{ pointerEvents: 'none' }}
        >
          {result.flowMW.toFixed(0)}MW · {result.loadingPct.toFixed(0)}%
        </text>
      )}
    </g>
  );
}
