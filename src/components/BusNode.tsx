import type { BusDef, BusResult } from '../engine/types';
import { busAccent, COLORS, voltageColor } from './visuals';

interface Props {
  def: BusDef;
  result: BusResult;
  hovered: boolean;
  onHover: (id: number | null, evt?: React.MouseEvent) => void;
}

export default function BusNode({ def, result, hovered, onHover }: Props) {
  const accent = busAccent(def);
  const energized = result.energized;
  const statusColor = voltageColor(result.vMag, energized);
  const r = 22;

  // 라벨 배치 방향
  const side: 'left' | 'right' | 'top' =
    def.x < 300 ? 'left' : def.x > 800 ? 'right' : 'top';

  const nameY = def.category === 'distribution' || def.category === 'collector' ? -34 : -32;

  return (
    <g
      transform={`translate(${def.x} ${def.y})`}
      onMouseEnter={(e) => onHover(def.id, e)}
      onMouseMove={(e) => onHover(def.id, e)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* 가압 글로우 */}
      {energized && (
        <circle r={r + 7} fill={statusColor} opacity={hovered ? 0.22 : 0.12} />
      )}

      {/* Slack 이중 링 */}
      {def.type === 'slack' && (
        <circle
          r={r + 4}
          fill="none"
          stroke={accent}
          strokeWidth={1.4}
          opacity={energized ? 0.6 : 0.25}
          strokeDasharray="3 3"
        />
      )}

      {/* 본체 */}
      <circle
        r={r}
        fill={energized ? '#0b1424' : '#161e2e'}
        stroke={energized ? accent : COLORS.deEnergized}
        strokeWidth={hovered ? 3.2 : 2.4}
        strokeDasharray={energized ? undefined : '4 4'}
      />
      {/* 전압 상태 내부 디스크 */}
      <circle r={r - 6} fill={statusColor} opacity={energized ? 0.28 : 0.1} />

      {/* 모선 번호 */}
      <text
        textAnchor="middle"
        y={-1}
        fontSize={16}
        fontWeight={800}
        fill={energized ? '#f1f5f9' : COLORS.subtext}
      >
        {def.id}
      </text>
      {/* 모선 타입 뱃지 */}
      <text
        textAnchor="middle"
        y={11}
        fontSize={7.5}
        fontWeight={700}
        fill={energized ? accent : COLORS.deEnergized}
        style={{ letterSpacing: '0.08em' }}
      >
        {def.type.toUpperCase()}
      </text>

      {/* 발전기/부하 인디케이터 */}
      {def.category === 'generator' && (
        <text textAnchor="middle" y={-r - 6} fontSize={13}>
          ⚡
        </text>
      )}

      {/* 이름 라벨 */}
      <text
        textAnchor={side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle'}
        x={side === 'left' ? -r - 8 : side === 'right' ? r + 8 : 0}
        y={side === 'top' ? nameY : -6}
        fontSize={11}
        fontWeight={700}
        fill={energized ? '#cbd5e1' : COLORS.subtext}
      >
        {def.name}
      </text>

      {/* 전압/상태 라벨 */}
      <text
        textAnchor={side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle'}
        x={side === 'left' ? -r - 8 : side === 'right' ? r + 8 : 0}
        y={side === 'top' ? nameY + 13 : 9}
        fontSize={10}
        fontWeight={600}
        fill={energized ? statusColor : COLORS.overload}
      >
        {energized ? `${result.vMag.toFixed(3)} pu` : '정전'}
      </text>

      {/* 부하량 표기 */}
      {def.category === 'load' && (
        <text
          textAnchor={side === 'right' ? 'start' : 'middle'}
          x={side === 'right' ? r + 8 : 0}
          y={side === 'top' ? nameY + 26 : 22}
          fontSize={9.5}
          fill={COLORS.load}
          fontWeight={600}
        >
          {result.pLoad.toFixed(0)} MW
        </text>
      )}
      {/* 발전량 표기 */}
      {def.category === 'generator' && (
        <text
          textAnchor={side === 'left' ? 'end' : 'middle'}
          x={side === 'left' ? -r - 8 : 0}
          y={22}
          fontSize={9.5}
          fill={energized ? '#86efac' : COLORS.subtext}
          fontWeight={600}
        >
          {result.pGen.toFixed(0)} MW
        </text>
      )}
    </g>
  );
}
