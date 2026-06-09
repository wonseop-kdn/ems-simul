"""
N-1 해석 — 선로·변압기를 하나씩 개방하며 PF 반복 실행
"""

from powerflow import run_power_flow
from system_model import BRANCHES, DEFAULT_STATE
import copy


def run_n1_analysis(state: dict = None) -> list:
    """
    모든 선로에 대해 N-1 해석 수행
    반환: 각 선로 개방 시 결과 리스트
    """
    if state is None:
        state = DEFAULT_STATE

    results = []
    for br in BRANCHES:
        # 해당 선로 차단기만 개방
        test_state = copy.deepcopy(state)
        test_state['breakers'][br['id']] = False

        pf = run_power_flow(test_state)
        results.append({
            'branchId':   br['id'],
            'branchName': br['name'],
            'converged':  pf['converged'],
            'islanded':   pf['islandedBuses'],
            'totalGenMW': pf['totalGenMW'],
            'totalLossMW':pf['totalLossMW'],
            'buses':      pf['buses'],
            'branches':   pf['branches'],
            'overloads':  [b['name'] for b in BRANCHES
                           if pf['branches'].get(b['id'], {}).get('overloaded')],
        })
    return results
