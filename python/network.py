"""
Ybus(G, B) 행렬 구성 + BFS 가압 판정
Topology Processing: Slack에서 도달 가능한 모선만 해석 대상
"""

from collections import deque
from system_model import BUSES, BRANCHES, SLACK_BUS, BASE_MVA, LOAD_QP


def find_energized(breakers: dict) -> set:
    """BFS로 Slack 모선에서 도달 가능한 모선 집합 탐색"""
    adj = {b['id']: [] for b in BUSES}
    for br in BRANCHES:
        if breakers.get(br['id'], False):
            adj[br['from']].append(br['to'])
            adj[br['to']].append(br['from'])

    visited = {SLACK_BUS}
    queue = deque([SLACK_BUS])
    while queue:
        cur = queue.popleft()
        for nxt in adj[cur]:
            if nxt not in visited:
                visited.add(nxt)
                queue.append(nxt)
    return visited


def build_network(state: dict) -> dict:
    """
    운전 상태로부터 네트워크 객체 구성
    반환: {n, energized, islanded, local, G, B, branches,
           type, vSet, pSched, qSched, slackLocal}
    """
    energized_set = find_energized(state['breakers'])
    bus_map = {b['id']: b for b in BUSES}

    energized = [b['id'] for b in BUSES if b['id'] in energized_set]
    islanded  = [b['id'] for b in BUSES if b['id'] not in energized_set]
    local     = {bid: i for i, bid in enumerate(energized)}
    n         = len(energized)

    # Ybus 초기화
    G = [[0.0]*n for _ in range(n)]
    B = [[0.0]*n for _ in range(n)]
    net_branches = []

    for br in BRANCHES:
        if not state['breakers'].get(br['id'], False):
            continue
        if br['from'] not in energized_set or br['to'] not in energized_set:
            continue
        denom = br['r']**2 + br['x']**2
        g =  br['r'] / denom
        b = -br['x'] / denom
        i, j = local[br['from']], local[br['to']]
        G[i][i] += g;  G[j][j] += g
        G[i][j] -= g;  G[j][i] -= g
        B[i][i] += b;  B[j][j] += b
        B[i][j] -= b;  B[j][i] -= b
        net_branches.append({'id': br['id'], 'name': br['name'],
                              'fromId': br['from'], 'toId': br['to'],
                              'fromLocal': i, 'toLocal': j,
                              'g': g, 'b': b, 'limitMW': br['limitMW']})

    # 모선별 타입·스케줄 설정
    btype  = [None]*n
    vSet   = [1.0]*n
    pSched = [0.0]*n
    qSched = [0.0]*n

    for bid in energized:
        bus = bus_map[bid]
        i = local[bid]
        btype[i] = bus['type']
        if bus['type'] == 'slack':
            vSet[i] = state['slackVSet']
        elif bus['type'] == 'pv':
            vSet[i]   = state['pvVSet']
            pSched[i] = state['pvGenMW'] / BASE_MVA
        else:
            load = state['loads'].get(bid, 0)
            pSched[i] = -load / BASE_MVA
            qSched[i] = -load * LOAD_QP / BASE_MVA

    slack_local = local[SLACK_BUS]

    return {'n': n, 'energized': energized, 'islanded': islanded,
            'local': local, 'G': G, 'B': B, 'branches': net_branches,
            'type': btype, 'vSet': vSet, 'pSched': pSched, 'qSched': qSched,
            'slackLocal': slack_local}


def bus_injection(net: dict, V: list, th: list, i: int):
    """모선 i의 계산 주입전력 P, Q (pu)"""
    P = Q = 0.0
    for j in range(net['n']):
        ang = th[i] - th[j]
        c, s = __import__('math').cos(ang), __import__('math').sin(ang)
        P += V[j] * (net['G'][i][j]*c + net['B'][i][j]*s)
        Q += V[j] * (net['G'][i][j]*s - net['B'][i][j]*c)
    return V[i]*P, V[i]*Q
