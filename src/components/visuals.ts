import type { BranchResult, BusResult } from '../engine/types';
import type { BusDef } from '../engine/types';

// ─────────────────────────────────────────────────────────────────────────────
//  색상/포맷 유틸 (다크 테마 전력관제 무드)
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  bg: '#0f172a',
  panel: '#111c33',
  grid: '#1e293b',
  deEnergized: '#475569',
  flow: '#34d399',
  flowHigh: '#fbbf24',
  overload: '#f43f5e',
  slack: '#22d3ee',
  pv: '#a78bfa',
  collector: '#38bdf8',
  distribution: '#2dd4bf',
  load: '#f59e0b',
  text: '#e2e8f0',
  subtext: '#94a3b8',
};

export function fmt(n: number, d = 1): string {
  if (!isFinite(n)) return '–';
  return n.toFixed(d);
}

export function fmtSigned(n: number, d = 1): string {
  if (!isFinite(n)) return '–';
  return (n >= 0 ? '+' : '') + n.toFixed(d);
}

/** 전압 크기에 따른 상태 색상 */
export function voltageColor(vMag: number, energized: boolean): string {
  if (!energized || vMag <= 0) return COLORS.deEnergized;
  if (vMag < 0.94) return '#fb7185'; // 저전압 경보
  if (vMag < 0.96) return '#fbbf24'; // 저전압 주의
  if (vMag > 1.06) return '#818cf8'; // 과전압
  return '#34d399'; // 정상
}

/** 모선 카테고리 기본 강조색 */
export function busAccent(bus: BusDef): string {
  switch (bus.category) {
    case 'generator':
      return bus.type === 'slack' ? COLORS.slack : COLORS.pv;
    case 'collector':
      return COLORS.collector;
    case 'distribution':
      return COLORS.distribution;
    case 'load':
      return COLORS.load;
  }
}

/** 선로 부하율에 따른 색상 */
export function loadingColor(br: BranchResult): string {
  if (!br.energized) return COLORS.deEnergized;
  if (br.overloaded) return COLORS.overload;
  if (br.loadingPct > 80) return COLORS.flowHigh;
  return COLORS.flow;
}

export function loadingBarColor(pct: number): string {
  if (pct > 100) return COLORS.overload;
  if (pct > 80) return COLORS.flowHigh;
  if (pct > 60) return '#a3e635';
  return COLORS.flow;
}

/** 모선 표시용 합성 결과 */
export function busStatusLabel(b: BusResult): string {
  if (!b.energized) return '정전 (De-energized)';
  if (b.vMag < 0.94) return '저전압 경보';
  if (b.vMag > 1.06) return '과전압';
  return '정상 가압';
}
