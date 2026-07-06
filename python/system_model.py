"""
7-Bus EMS 시뮬레이터 — 계통 정적 데이터
Bus-Branch 모델 / 기준용량 100 MVA
전압레벨: 154kV (송전단) / 22.9kV (배전단)
"""

import math

BASE_MVA = 100       # 기준용량 (MVA)
LOAD_PF  = 0.95      # 부하 역률
LOAD_QP  = math.tan(math.acos(LOAD_PF))  # Q/P 비율 ≈ 0.3287

SLACK_BUS = 1
PV_BUS    = 2

# ── 모선 정의 ─────────────────────────────────────────
# type: 'slack' | 'pv' | 'pq'
BUSES = [
    {'id': 1, 'name': 'Bus 1', 'type': 'slack', 'baseKV': 345, 'vSet': 1.05},
    {'id': 2, 'name': 'Bus 2', 'type': 'pv',    'baseKV': 345, 'vSet': 1.05},
    {'id': 6, 'name': 'Bus 6', 'type': 'pq',    'baseKV': 345, 'vSet': 1.00},
    {'id': 7, 'name': 'Bus 7', 'type': 'pq',    'baseKV': 154, 'vSet': 1.00},
    {'id': 3, 'name': 'Bus 3', 'type': 'pq',    'baseKV': 154, 'vSet': 1.00},
    {'id': 4, 'name': 'Bus 4', 'type': 'pq',    'baseKV': 154, 'vSet': 1.00},
    {'id': 5, 'name': 'Bus 5', 'type': 'pq',    'baseKV': 154, 'vSet': 1.00},
]

# ── 선로/변압기 정의 ──────────────────────────────────
# r, x: 직렬 저항·리액턴스 (pu), limitMW: 열적한계
BRANCHES = [
    {'id': 1, 'name': '선로 1',      'from': 1, 'to': 6, 'r': 0.01, 'x': 0.03, 'limitMW': 160},
    {'id': 2, 'name': '선로 2',      'from': 2, 'to': 6, 'r': 0.01, 'x': 0.03, 'limitMW': 160},
    {'id': 3, 'name': '변압기 TR',   'from': 6, 'to': 7, 'r': 0.02, 'x': 0.10, 'limitMW': 120},
    {'id': 4, 'name': '선로 4',      'from': 7, 'to': 3, 'r': 0.04, 'x': 0.15, 'limitMW': 40},
    {'id': 5, 'name': '선로 5',      'from': 7, 'to': 4, 'r': 0.04, 'x': 0.15, 'limitMW': 40},
    {'id': 6, 'name': '선로 6',      'from': 7, 'to': 5, 'r': 0.04, 'x': 0.15, 'limitMW': 40},
]

# ── 기본 운전 상태 ────────────────────────────────────
DEFAULT_STATE = {
    'loads':    {3: 30, 4: 25, 5: 35},   # 부하 MW
    'pvGenMW':  50,                        # PV 발전기 출력 MW
    'pvVSet':   1.05,
    'slackVSet':1.05,
    'breakers': {1: True, 2: True, 3: True, 4: True, 5: True, 6: True},
}
