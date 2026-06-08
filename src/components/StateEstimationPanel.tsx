import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Radar } from 'lucide-react';
import { runStateEstimation, type SEResult } from '../engine/stateEstimation';
import type { OperatingState } from '../engine/types';
import { COLORS, fmt, fmtSigned } from './visuals';

interface Props {
  state: OperatingState;
}

export default function StateEstimationPanel({ state }: Props) {
  const [withBad, setWithBad] = useState(false);
  const [se, setSe] = useState<SEResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const run = () => setSe(runStateEstimation(state, { withBadData: withBad }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radar size={15} className="text-cyan-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          상태 추정 · WLS State Estimation
        </h3>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        SCADA 계측값(전압·주입·조류)에 가우시안 노이즈를 주입하고, 가중최소자승(WLS)
        으로 참 상태를 복원합니다. 카이제곱 검정 + 최대정규화잔차(LNR)로 불량
        데이터를 검출·식별합니다.
      </p>

      {/* ── 개념 설명 (접이식) ───────────────────────────── */}
      <div className="rounded-lg border border-cyan-700/40 bg-cyan-500/5">
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center gap-1.5 px-2.5 py-2 text-[11px] font-semibold text-cyan-300"
        >
          {showHelp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          상태추정이란? — 수식 단계별 설명 보기
        </button>
        {showHelp && (
          <div className="space-y-2.5 border-t border-cyan-700/30 px-3 py-2.5 text-[10.5px] leading-relaxed text-slate-300">
            <div>
              <span className="font-bold text-cyan-300">한 줄 요약.</span> 측정값이
              미지수보다 많다는 점(여분)을 이용해, 노이즈는 평균으로 상쇄하고 튀는
              값 하나(불량)는 도드라지게 만들어 잡아내는 기법입니다.
            </div>

            <div>
              <div className="font-bold text-slate-200">STEP 0 · 비유 (체중 3번 재기)</div>
              체중을 70.1·69.8·70.3kg 으로 쟀다면 진짜 몸무게는 평균 70.07. 측정이
              여러 개라 추정이 가능합니다. 여기에 ① 정밀도 가중치, ② 비선형 반복만
              더하면 계통 상태추정이 됩니다.
            </div>

            <div>
              <div className="font-bold text-slate-200">STEP 1 · 모르는 것 / 아는 것</div>
              <div className="mt-1 rounded bg-slate-900/60 p-2 font-mono text-[9.5px] text-slate-400">
                상태 x = 13개  (θ₂~θ₇ 6 + V₁~V₇ 7){'\n'}
                계측 z = 31개  (V 7 + Pinj·Qinj 각6 + Pflow·Qflow 각6){'\n'}
                여분 = 31 − 13 = <span className="text-cyan-300">18</span> ← 오차를 거르는 잉여
              </div>
            </div>

            <div>
              <div className="font-bold text-slate-200">STEP 2~3 · 예측 h(x)와 목적함수 J</div>
              상태 x로 각 계측이 얼마여야 하는지 계산한 값이 h(x). 측정 z와의 차이를
              정밀도로 가중해 제곱·합산한 게 J입니다.
              <div className="mt-1 rounded bg-slate-900/60 p-2 font-mono text-[9.5px] text-slate-400">
                rᵢ = zᵢ − hᵢ(x)        (측정 − 예측){'\n'}
                wᵢ = 1/σᵢ²            (정밀할수록 큰 가중치){'\n'}
                J(x) = Σ (zᵢ − hᵢ(x))² / σᵢ²  → 최소로 만드는 x̂ 가 답
              </div>
            </div>

            <div>
              <div className="font-bold text-slate-200">STEP 4 · Gauss-Newton 반복</div>
              h가 비선형이라 한 번에 못 풉니다. 야코비안 H=∂h/∂x 로 반복 보정합니다.
              <div className="mt-1 rounded bg-slate-900/60 p-2 font-mono text-[9.5px] text-slate-400">
                (HᵀWH) Δx = HᵀW (z − h(x)){'\n'}
                x ← x + Δx,  |Δx|&lt;1e-7 까지 (실제 4회 수렴)
              </div>
            </div>

            <div>
              <div className="font-bold text-rose-300">STEP 5 · 검출 — χ² 검정</div>
              추정 후 남은 J가 "전체적으로 얼마나 안 맞았나". 정상이면 J는 자유도 18
              카이제곱 분포를 따릅니다.
              <div className="mt-1 rounded bg-slate-900/60 p-2 font-mono text-[9.5px] text-slate-400">
                임계값 χ²₀.₉₉(18) = 34.83{'\n'}
                정상:  J ≈ <span className="text-emerald-300">17</span>  &lt; 34.83 → 통과{'\n'}
                불량:  J ≈ <span className="text-rose-300">1900</span> ≫ 34.83 → 검출
              </div>
            </div>

            <div>
              <div className="font-bold text-rose-300">STEP 6 · 식별 — 정규화잔차(LNR)</div>
              범인을 찾으려면 잔차를 표준편차로 나눠 공정하게 비교합니다.
              <div className="mt-1 rounded bg-slate-900/60 p-2 font-mono text-[9.5px] text-slate-400">
                rₙ,ᵢ = |rᵢ| / √Ωᵢᵢ,  Ω = R − H(HᵀWH)⁻¹Hᵀ{'\n'}
                최대 rₙ = 범인 → P7-3 정확히 지목 ✓
              </div>
            </div>

            <div className="rounded bg-amber-500/10 p-2 text-amber-200/90">
              <span className="font-bold">Smearing(파급):</span> 불량은 P7-3 하나뿐인데
              인근 계측도 노란색이 됩니다. 추정이 오염값에 끌려가 인근 잔차도 덩달아
              커진 것일 뿐(실제 오류 아님). 그래서 한 번에 하나씩만 제거합니다.
            </div>
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 p-2.5 text-[12px] text-slate-200">
        <input
          type="checkbox"
          checked={withBad}
          onChange={(e) => setWithBad(e.target.checked)}
          className="h-4 w-4 accent-rose-500"
        />
        불량 데이터(Bad Data) 주입 — 선로 조류 계측에 총오차 +45MW
      </label>

      <button
        onClick={run}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500/90 py-2 text-xs font-bold text-white transition hover:bg-cyan-500"
      >
        <Radar size={14} /> 상태추정 실행
      </button>

      {se && !se.ok && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
          {se.message}
        </div>
      )}

      {se && se.ok && (
        <>
          {/* 검출 요약 */}
          <div
            className="flex items-start gap-2 rounded-lg border p-2.5"
            style={{
              borderColor: se.badDataDetected ? '#f43f5e55' : '#34d39955',
              backgroundColor: se.badDataDetected ? '#f43f5e12' : '#34d39912',
            }}
          >
            {se.badDataDetected ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            )}
            <div className="text-[11px] leading-tight">
              <div
                className="font-bold"
                style={{ color: se.badDataDetected ? COLORS.overload : COLORS.flow }}
              >
                {se.badDataDetected
                  ? '불량 데이터 검출됨 (χ² 검정 초과)'
                  : '정상 — 불량 데이터 없음'}
              </div>
              {se.identifiedLabel && (
                <div className="mt-0.5 text-rose-300">
                  식별된 이상 계측: <span className="font-mono">{se.identifiedLabel}</span>{' '}
                  (최대정규화잔차)
                </div>
              )}
            </div>
          </div>

          {/* χ² 게이지 */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2.5">
            <div className="mb-1 flex justify-between text-[10.5px] text-slate-400">
              <span>
                목적함수 J(x̂) ={' '}
                <span className="font-mono font-bold text-slate-200">
                  {fmt(se.objectiveJ, 1)}
                </span>
              </span>
              <span>
                임계값 χ²₀.₉₉ ={' '}
                <span className="font-mono">{fmt(se.chiThreshold, 1)}</span>
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-900/80">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min((se.objectiveJ / (se.chiThreshold * 1.5)) * 100, 100)}%`,
                  backgroundColor: se.badDataDetected ? COLORS.overload : COLORS.flow,
                }}
              />
              <div
                className="absolute top-0 h-full w-[2px] bg-slate-300"
                style={{ left: `${Math.min((1 / 1.5) * 100, 100)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9.5px] text-slate-500">
              <span>자유도 {se.dof} · {se.iterations}회 반복 수렴</span>
              <span>↑ 임계선</span>
            </div>
          </div>

          {/* 추정 상태 vs 참값 */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-300">
              복원된 상태량 (추정 vs 참)
            </div>
            <div className="grid grid-cols-1 gap-1">
              {se.states.map((s) => (
                <div
                  key={s.busId}
                  className="flex items-center justify-between text-[10.5px]"
                >
                  <span className="text-slate-400">모선 {s.busId}</span>
                  <span className="font-mono text-slate-300">
                    V̂ {fmt(s.vEst, 4)}
                    <span className="text-slate-500"> (참 {fmt(s.vTrue, 4)})</span>
                    {'  '}
                    θ̂ {fmtSigned(s.thEstDeg, 2)}°
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 계측 잔차 테이블 */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-300">
              계측 잔차 분석 ({se.rows.length}개 계측)
            </div>
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-slate-800 text-slate-400">
                  <tr>
                    <th className="py-1 text-left font-medium">계측</th>
                    <th className="text-right font-medium">측정</th>
                    <th className="text-right font-medium">추정</th>
                    <th className="text-right font-medium">rₙ</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {se.rows.map((r, i) => {
                    const danger = r.flagged;
                    const warn = !danger && r.normResidual > 3;
                    return (
                      <tr
                        key={i}
                        style={{
                          backgroundColor: danger
                            ? '#f43f5e22'
                            : r.injectedBad
                              ? '#f59e0b14'
                              : undefined,
                        }}
                      >
                        <td className="py-0.5 text-left text-slate-300">
                          {r.label}
                          {r.injectedBad && (
                            <span className="ml-1 text-amber-400">◆</span>
                          )}
                        </td>
                        <td className="text-right text-slate-300">
                          {fmt(r.measured, r.unit === 'pu' ? 3 : 1)}
                        </td>
                        <td className="text-right text-slate-400">
                          {fmt(r.estimated, r.unit === 'pu' ? 3 : 1)}
                        </td>
                        <td
                          className="text-right font-bold"
                          style={{
                            color: danger
                              ? COLORS.overload
                              : warn
                                ? COLORS.flowHigh
                                : COLORS.subtext,
                          }}
                        >
                          {fmt(r.normResidual, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 text-[9px] text-slate-500">
              ◆ 주입된 불량데이터 · rₙ = 정규화잔차 (&gt;3 의심, 적색 = LNR 식별)
            </div>
          </div>
        </>
      )}
    </div>
  );
}
