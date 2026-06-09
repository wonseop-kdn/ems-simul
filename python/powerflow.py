"""
Newton-Raphson 전력 조류 계산 (Power Flow)
외부 라이브러리 없이 직접 구현
"""

import math
from network import build_network, bus_injection
from linalg import solve_linear
from system_model import BASE_MVA, BRANCHES, LOAD_QP


def newton_raphson(net: dict, max_iter=50, tol=1e-8) -> dict:
    """
    Newton-Raphson 반복으로 V, θ 계산
    반환: {V, th, converged, iterations, maxMismatch, mismatchHistory}
    """
    n          = net['n']
    slack_loc  = net['slackLocal']
    btype      = net['type']
    vSet       = net['vSet']

    # Flat Start 초기화
    V  = [vSet[i] if btype[i] in ('slack','pv') else 1.0 for i in range(n)]
    th = [0.0]*n

    # 미지수 인덱스
    angle_idx = [i for i in range(n) if i != slack_loc]
    volt_idx  = [i for i in range(n) if btype[i] == 'pq']
    na, nv    = len(angle_idx), len(volt_idx)
    dim       = na + nv

    history = []
    converged = (dim == 0)
    max_mm = 0.0

    if dim == 0:
        return {'V': V, 'th': th, 'converged': True,
                'iterations': 0, 'maxMismatch': 0.0, 'mismatchHistory': []}

    for iteration in range(max_iter):
        # ① 주입전력 계산
        Pc = [0.0]*n; Qc = [0.0]*n
        for i in range(n):
            Pc[i], Qc[i] = bus_injection(net, V, th, i)

        # ② mismatch 벡터
        mm = [0.0]*dim
        for a, i in enumerate(angle_idx):
            mm[a] = net['pSched'][i] - Pc[i]
        for v, i in enumerate(volt_idx):
            mm[na+v] = net['qSched'][i] - Qc[i]

        # ③ 최대 불일치 추적
        max_mm = max(abs(x) for x in mm)
        mm_idx = max(range(dim), key=lambda k: abs(mm[k]))
        if mm_idx < na:
            mm_bus  = net['energized'][angle_idx[mm_idx]]
            mm_kind = 'P'
        else:
            mm_bus  = net['energized'][volt_idx[mm_idx-na]]
            mm_kind = 'Q'
        history.append({'iter': iteration, 'max': max_mm,
                        'bus': mm_bus, 'kind': mm_kind})

        if max_mm < tol:
            converged = True
            break

        # ④ 야코비안 구성
        G, B = net['G'], net['B']

        def dPdth(i, j):
            if i == j: return -Qc[i] - B[i][i]*V[i]**2
            a = th[i]-th[j]
            return V[i]*V[j]*(G[i][j]*math.sin(a) - B[i][j]*math.cos(a))

        def dPdV(i, j):
            if i == j: return Pc[i]/V[i] + G[i][i]*V[i]
            a = th[i]-th[j]
            return V[i]*(G[i][j]*math.cos(a) + B[i][j]*math.sin(a))

        def dQdth(i, j):
            if i == j: return Pc[i] - G[i][i]*V[i]**2
            a = th[i]-th[j]
            return -V[i]*V[j]*(G[i][j]*math.cos(a) + B[i][j]*math.sin(a))

        def dQdV(i, j):
            if i == j: return Qc[i]/V[i] - B[i][i]*V[i]
            a = th[i]-th[j]
            return V[i]*(G[i][j]*math.sin(a) - B[i][j]*math.cos(a))

        J = [[0.0]*dim for _ in range(dim)]
        for a, i in enumerate(angle_idx):
            for aa, ii in enumerate(angle_idx): J[a][aa]    = dPdth(i, ii)
            for vv, ii in enumerate(volt_idx):  J[a][na+vv] = dPdV(i, ii)
        for v, i in enumerate(volt_idx):
            for aa, ii in enumerate(angle_idx): J[na+v][aa]    = dQdth(i, ii)
            for vv, ii in enumerate(volt_idx):  J[na+v][na+vv] = dQdV(i, ii)

        # ⑤ 보정량 계산 및 적용
        dx = solve_linear(J, mm)
        for a, i in enumerate(angle_idx): th[i] += dx[a]
        for v, i in enumerate(volt_idx):  V[i]  += dx[na+v]

    return {'V': V, 'th': th, 'converged': converged,
            'iterations': iteration+1, 'maxMismatch': max_mm,
            'mismatchHistory': history}


def branch_power(br, Vi, Vj, thi, thj):
    """선로 양단 조류 계산"""
    g, b = br['g'], br['b']
    a = thi - thj
    c, s = math.cos(a), math.sin(a)
    pij =  g*Vi**2 - Vi*Vj*(g*c + b*s)
    qij = -b*Vi**2 - Vi*Vj*(g*s - b*c)
    pji =  g*Vj**2 - Vi*Vj*(g*c - b*s)
    qji = -b*Vj**2 - Vi*Vj*(-g*s - b*c)
    return pij, qij, pji, qji


def run_power_flow(state: dict) -> dict:
    """조류계산 전체 실행 — 모선·선로 결과 반환"""
    net = build_network(state)
    sol = newton_raphson(net)
    bus_map = {b['id']: b for b in __import__('system_model').BUSES}

    buses = {}
    for bid in bus_map:
        li = net['local'].get(bid)
        bus = bus_map[bid]
        is_load = bus.get('category', '') == 'load' or bid in state['loads']
        p_load = state['loads'].get(bid, 0) if bid in state['loads'] else 0
        q_load = p_load * LOAD_QP

        if li is None or not sol['converged']:
            buses[bid] = {'id': bid, 'energized': False, 'vMag': 0, 'vAngle': 0,
                          'pGen': 0, 'qGen': 0, 'pLoad': p_load, 'qLoad': 0,
                          'pInj': 0, 'qInj': 0}
            continue

        Pc, Qc = bus_injection(net, sol['V'], sol['th'], li)
        pInj = Pc * BASE_MVA
        qInj = Qc * BASE_MVA
        is_gen = bid in (1, 2)
        buses[bid] = {
            'id': bid, 'energized': True,
            'vMag':   sol['V'][li],
            'vAngle': math.degrees(sol['th'][li]),
            'pGen':   pInj + p_load if is_gen else 0,
            'qGen':   qInj + q_load if is_gen else 0,
            'pLoad':  p_load, 'qLoad': q_load,
            'pInj': pInj, 'qInj': qInj,
        }

    branches = {}
    for brDef in BRANCHES:
        closed  = state['breakers'].get(brDef['id'], False)
        net_br  = next((b for b in net['branches'] if b['id'] == brDef['id']), None)
        en      = closed and net_br and sol['converged']
        if not en:
            branches[brDef['id']] = {'id': brDef['id'], 'closed': closed,
                                      'energized': False, 'pFrom': 0, 'qFrom': 0,
                                      'pTo': 0, 'qTo': 0, 'pLoss': 0,
                                      'loadingPct': 0, 'overloaded': False}
            continue
        i, j = net_br['fromLocal'], net_br['toLocal']
        pij, qij, pji, qji = branch_power(
            net_br, sol['V'][i], sol['V'][j], sol['th'][i], sol['th'][j])
        pFrom, qFrom = pij*BASE_MVA, qij*BASE_MVA
        pTo,   qTo   = pji*BASE_MVA, qji*BASE_MVA
        sFrom = math.hypot(pFrom, qFrom)
        loading = sFrom / brDef['limitMW'] * 100
        branches[brDef['id']] = {
            'id': brDef['id'], 'name': brDef['name'], 'closed': closed,
            'energized': True, 'pFrom': pFrom, 'qFrom': qFrom,
            'pTo': pTo, 'qTo': qTo, 'pLoss': pFrom+pTo,
            'loadingPct': loading, 'overloaded': loading > 100,
        }

    total_gen  = sum(b['pGen']  for b in buses.values() if b['energized'])
    total_load = sum(b['pLoad'] for b in buses.values() if b['energized'])
    total_loss = sum(b['pLoss'] for b in branches.values() if b['energized'])

    return {
        'converged':       sol['converged'],
        'iterations':      sol['iterations'],
        'maxMismatch':     sol['maxMismatch'],
        'mismatchHistory': sol['mismatchHistory'],
        'buses':           buses,
        'branches':        branches,
        'totalGenMW':      total_gen,
        'totalLoadMW':     total_load,
        'totalLossMW':     total_loss,
        'energizedBuses':  net['energized'],
        'islandedBuses':   net['islanded'],
    }
