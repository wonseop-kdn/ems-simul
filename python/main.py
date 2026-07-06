"""
7-Bus EMS 시뮬레이터 — Python 엔진 메인 실행파일
실행: python main.py

구현 알고리즘:
  1. Topology 처리 (BFS 가압 판정)
  2. Ybus 행렬 구성
  3. Newton-Raphson 조류계산 (Power Flow)
  4. N-1 해석 (Contingency Analysis)
  5. WLS 상태추정 (State Estimation)
"""

from system_model import DEFAULT_STATE, BRANCHES
from powerflow import run_power_flow
from contingency import run_n1_analysis
from state_estimation import run_state_estimation


def sep(title=''):
    w = 60
    if title:
        print(f"\n{'─'*4} {title} {'─'*(w-6-len(title))}")
    else:
        print('─'*w)


def run():
    print('='*60)
    print('  7-Bus EMS 시뮬레이터 — Python 엔진')
    print('  Bus-Branch 모델 / 기준용량 100 MVA')
    print('  345kV 송전 → 154kV 변전')
    print('='*60)

    # ════════════════════════════════════════════════════
    # 1. 조류계산 (Power Flow)
    # ════════════════════════════════════════════════════
    sep('1. 조류계산 (Newton-Raphson Power Flow)')
    state = DEFAULT_STATE
    pf = run_power_flow(state)

    print(f"\n  수렴 여부   : {'✅ 수렴' if pf['converged'] else '❌ 발산'}")
    print(f"  반복 횟수   : {pf['iterations']} 회")
    print(f"  최대 잔차   : {pf['maxMismatch']:.3e} pu")
    print(f"  총 발전량   : {pf['totalGenMW']:.2f} MW")
    print(f"  총 부하량   : {pf['totalLoadMW']:.2f} MW")
    print(f"  송전 손실   : {pf['totalLossMW']:.2f} MW")

    sep('NR 수렴 추이 (이차수렴)')
    for h in pf['mismatchHistory']:
        bar = '█' * max(1, int(-h['max'] * 0 + 20 - min(20, int(-math.log10(max(h['max'],1e-15)))*2)))
        print(f"  iter {h['iter']}  {h['max']:12.3e} pu   Δ{h['kind']}@Bus{h['bus']}")

    sep('모선 결과')
    print(f"  {'Bus':>5}  {'타입':>6}  {'전압(pu)':>9}  {'위상각(°)':>10}  {'발전(MW)':>9}  {'부하(MW)':>9}")
    print(f"  {'─'*5}  {'─'*6}  {'─'*9}  {'─'*10}  {'─'*9}  {'─'*9}")
    for bid in [1,2,6,7,3,4,5]:
        b = pf['buses'][bid]
        if b['energized']:
            print(f"  {bid:>5}  {'slack' if bid==1 else 'pv' if bid==2 else 'pq':>6}"
                  f"  {b['vMag']:>9.4f}  {b['vAngle']:>+10.3f}"
                  f"  {b['pGen']:>9.2f}  {b['pLoad']:>9.2f}")
        else:
            print(f"  {bid:>5}  {'pq':>6}  {'고립(정전)':>9}")

    sep('선로 결과')
    print(f"  {'선로':>10}  {'조류(MW)':>9}  {'손실(MW)':>9}  {'부하율(%)':>9}  {'상태':>6}")
    print(f"  {'─'*10}  {'─'*9}  {'─'*9}  {'─'*9}  {'─'*6}")
    br_map = {b['id']: b for b in BRANCHES}
    for bid, br in pf['branches'].items():
        name = br_map[bid]['name']
        if br['energized']:
            status = '⚠ 과부하' if br['overloaded'] else '정상'
            print(f"  {name:>10}  {br['pFrom']:>9.2f}  {br['pLoss']:>9.2f}"
                  f"  {br['loadingPct']:>9.1f}  {status:>6}")
        else:
            print(f"  {name:>10}  {'개방':>9}")

    # ════════════════════════════════════════════════════
    # 2. N-1 해석
    # ════════════════════════════════════════════════════
    sep('2. N-1 해석 (Contingency Analysis)')
    n1 = run_n1_analysis(state)
    print(f"\n  {'개방 선로':>12}  {'수렴':>5}  {'발전(MW)':>9}  {'손실(MW)':>9}  {'고립 모선':>10}  {'과부하':>8}")
    print(f"  {'─'*12}  {'─'*5}  {'─'*9}  {'─'*9}  {'─'*10}  {'─'*8}")
    for r in n1:
        conv  = '✅' if r['converged'] else '❌'
        isl   = str(r['islanded']) if r['islanded'] else '없음'
        ovr   = ', '.join(r['overloads']) if r['overloads'] else '없음'
        print(f"  {r['branchName']:>12}  {conv:>5}  {r['totalGenMW']:>9.2f}"
              f"  {r['totalLossMW']:>9.2f}  {isl:>10}  {ovr:>8}")

    # ════════════════════════════════════════════════════
    # 3. WLS 상태추정
    # ════════════════════════════════════════════════════
    sep('3. WLS 상태추정 (State Estimation)')

    print('\n  [정상 계측]')
    se = run_state_estimation(state)
    print(f"  목적함수 J   : {se['J']:.2f}")
    print(f"  자유도(dof)  : {se['dof']}")
    print(f"  χ² 임계값   : {se['chi2Threshold']}")
    print(f"  불량데이터   : {'❌ 탐지됨' if se['badDataDetected'] else '✅ 없음'}")
    print(f"  최대 정규화잔차 : {se['lnrMax']:.2f} (Δ{se['lnrType']}@Bus{se['lnrBus']})")

    print('\n  [불량 계측기 주입 — Bus3 전압 계측기 고장]')
    se_bad = run_state_estimation(state, bad_data_bus=3)
    print(f"  목적함수 J   : {se_bad['J']:.1f}")
    print(f"  불량데이터   : {'❌ 탐지됨' if se_bad['badDataDetected'] else '✅ 없음'}")
    print(f"  최대 정규화잔차 : {se_bad['lnrMax']:.2f} (Δ{se_bad['lnrType']}@Bus{se_bad['lnrBus']})")

    sep()
    print('  실행 완료.')
    print('='*60)


if __name__ == '__main__':
    import math
    run()
