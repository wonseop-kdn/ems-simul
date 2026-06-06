import { BRANCHES, BUSES, BUS_MAP, CANVAS } from '../engine/systemModel';
import type { SolveResult } from '../engine/types';
import BranchLine from './BranchLine';
import BusNode from './BusNode';
import { COLORS } from './visuals';

export interface HoverTarget {
  kind: 'bus' | 'branch';
  id: number;
}

interface Props {
  result: SolveResult;
  onToggleBreaker: (id: number) => void;
  onHover: (t: HoverTarget | null, pos?: { x: number; y: number }) => void;
  hover: HoverTarget | null;
}

const STAGES = [
  { label: '발전단 · GENERATION', x: 40, w: 240, color: COLORS.pv },
  { label: '수집 · 변전단 · SUBSTATION', x: 300, w: 440, color: COLORS.distribution },
  { label: '수용가 배전단 · DEMAND', x: 760, w: 210, color: COLORS.load },
];

export default function Diagram({ result, onToggleBreaker, onHover, hover }: Props) {
  return (
    <svg
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke={COLORS.grid}
            strokeWidth="0.6"
            opacity="0.5"
          />
        </pattern>
        <radialGradient id="vignette" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#16223d" />
          <stop offset="100%" stopColor={COLORS.bg} />
        </radialGradient>
      </defs>

      {/* 배경 */}
      <rect x={0} y={0} width={CANVAS.width} height={CANVAS.height} fill="url(#vignette)" />
      <rect x={0} y={0} width={CANVAS.width} height={CANVAS.height} fill="url(#grid)" />

      {/* 구역 밴드 */}
      {STAGES.map((s) => (
        <g key={s.label}>
          <rect
            x={s.x}
            y={28}
            width={s.w}
            height={CANVAS.height - 56}
            rx={14}
            fill={s.color}
            opacity={0.04}
            stroke={s.color}
            strokeOpacity={0.15}
            strokeWidth={1}
          />
          <text
            x={s.x + s.w / 2}
            y={48}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={s.color}
            opacity={0.75}
            style={{ letterSpacing: '0.1em' }}
          >
            {s.label}
          </text>
        </g>
      ))}

      {/* 선로 레이어 */}
      {BRANCHES.map((def) => (
        <BranchLine
          key={def.id}
          def={def}
          result={result.branches[def.id]}
          from={{ x: BUS_MAP[def.from].x, y: BUS_MAP[def.from].y }}
          to={{ x: BUS_MAP[def.to].x, y: BUS_MAP[def.to].y }}
          hovered={hover?.kind === 'branch' && hover.id === def.id}
          onToggleBreaker={onToggleBreaker}
          onHover={(id, e) =>
            onHover(
              id === null ? null : { kind: 'branch', id },
              e ? { x: e.clientX, y: e.clientY } : undefined,
            )
          }
        />
      ))}

      {/* 모선 레이어 */}
      {BUSES.map((def) => (
        <BusNode
          key={def.id}
          def={def}
          result={result.buses[def.id]}
          hovered={hover?.kind === 'bus' && hover.id === def.id}
          onHover={(id, e) =>
            onHover(
              id === null ? null : { kind: 'bus', id },
              e ? { x: e.clientX, y: e.clientY } : undefined,
            )
          }
        />
      ))}
    </svg>
  );
}
