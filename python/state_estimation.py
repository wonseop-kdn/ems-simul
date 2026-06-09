"""
WLS (Weighted Least Squares) 상태추정
계측값에 노이즈를 추가하여 실제 EMS 환경을 모사
"""

import math
import random
from network import build_network, bus_injection
from linalg import solve_linear
from system_model import BASE_MVA, BUSES


def run_state_estimation(state: dict, bad_data_bus: int = None) -> dict:
    """
    WLS 상태추정 실행
    bad_data_bus: 불량 데이터를 주입할 모선 ID (None이면 정상)
    """
    from powerflow import run_power_flow
    pf = run_power_flow(state)
    if not pf['converged']:
        return {'error': '조류계산 미수렴'}

    net = build_network(state)
    n   = net['n']

    # ── 계측값 생성 (실제 PF 결과 + 노이즈) ─────────────
    sigma_V   = 0.004   # 전압 계측 표준편차 (pu)
    sigma_P   = 0.008   # 전력 계측 표준편차 (pu)
    sigma_Q   = 0.008

    z_raw = []   # (값, 표준편차, 종류, 모선/선로)
    bus_map = {b['id']: b for b in BUSES}

    # 전압 계측 (모든 가압 모선)
    for bid in net['energized']:
        li  = net['local'][bid]
        v_true = pf['buses'][bid]['vMag']
        noise  = random.gauss(0, sigma_V)
        if bad_data_bus == bid:
            noise += 0.15   # 불량 데이터 주입
        z_raw.append({'type': 'V', 'bus': bid, 'val': v_true + noise, 'sigma': sigma_V})

    # 주입 전력 계측 (모든 가압 모선)
    for bid in net['energized']:
        p_true = pf['buses'][bid]['pInj'] / BASE_MVA
        q_true = pf['buses'][bid]['qInj'] / BASE_MVA
        z_raw.append({'type': 'P', 'bus': bid,
                      'val': p_true + random.gauss(0, sigma_P), 'sigma': sigma_P})
        z_raw.append({'type': 'Q', 'bus': bid,
                      'val': q_true + random.gauss(0, sigma_Q), 'sigma': sigma_Q})

    m = len(z_raw)
    dof = m - (2*n - 1)   # 자유도 = 계측수 - 상태수

    # ── Gauss-Newton 반복 ────────────────────────────────
    V  = list(net['vSet'])
    th = [0.0]*n
    for i in range(n):
        if net['type'][i] in ('slack','pv'):
            V[i] = net['vSet'][i]

    for _ in range(20):
        # h(x) 계산
        h = []
        for z in z_raw:
            li = net['local'][z['bus']]
            if z['type'] == 'V':
                h.append(V[li])
            elif z['type'] == 'P':
                p, _ = bus_injection(net, V, th, li)
                h.append(p)
            else:
                _, q = bus_injection(net, V, th, li)
                h.append(q)

        # 잔차 및 목적함수
        r = [z_raw[i]['val'] - h[i] for i in range(m)]
        J_obj = sum((r[i]/z_raw[i]['sigma'])**2 for i in range(m))

        # 수렴 체크
        if max(abs(x) for x in r) < 1e-6:
            break

        # H 야코비안 (수치 미분)
        state_vars = [th[i] for i in range(n) if i != net['slackLocal']] + \
                     [V[i]  for i in range(n) if net['type'][i] == 'pq']
        ns = len(state_vars)
        H  = [[0.0]*ns for _ in range(m)]
        eps = 1e-6
        for s_idx in range(ns):
            V2 = V[:]; th2 = th[:]
            nv_start = n - 1   # angle 개수
            if s_idx < nv_start:
                real_i = [i for i in range(n) if i != net['slackLocal']][s_idx]
                th2[real_i] += eps
            else:
                real_i = [i for i in range(n) if net['type'][i]=='pq'][s_idx - nv_start]
                V2[real_i] += eps
            for z_idx, z in enumerate(z_raw):
                li2 = net['local'][z['bus']]
                if z['type'] == 'V':
                    h2 = V2[li2]
                elif z['type'] == 'P':
                    h2, _ = bus_injection(net, V2, th2, li2)
                else:
                    _, h2 = bus_injection(net, V2, th2, li2)
                H[z_idx][s_idx] = (h2 - h[z_idx]) / eps

        # W = 1/sigma^2
        W = [1/z['sigma']**2 for z in z_raw]

        # G = H'WH,  Wr = H'Wr
        Gmat = [[sum(H[k][a]*W[k]*H[k][b] for k in range(m)) for b in range(ns)] for a in range(ns)]
        rhs  = [sum(H[k][a]*W[k]*r[k]     for k in range(m)) for a in range(ns)]

        try:
            dx = solve_linear(Gmat, rhs)
        except:
            break

        nv_start = n - 1
        for s_idx, real_i in enumerate(i for i in range(n) if i != net['slackLocal']):
            th[real_i] += dx[s_idx]
        for s_idx, real_i in enumerate(i for i in range(n) if net['type'][i]=='pq'):
            V[real_i] += dx[nv_start + s_idx]

    # ── 정규화 잔차 (LNR) ────────────────────────────────
    norm_residuals = [abs(r[i])/z_raw[i]['sigma'] for i in range(m)]
    lnr_max = max(norm_residuals)
    lnr_idx = norm_residuals.index(lnr_max)

    # 카이제곱 임계값 (dof=18 기준 99%)
    chi2_thresh = 34.83

    return {
        'J':              J_obj,
        'dof':            dof,
        'chi2Threshold':  chi2_thresh,
        'badDataDetected': J_obj > chi2_thresh,
        'lnrMax':         lnr_max,
        'lnrBus':         z_raw[lnr_idx]['bus'],
        'lnrType':        z_raw[lnr_idx]['type'],
        'measurements':   m,
        'stateVars':      2*n - 1,
        'estimatedV':     {net['energized'][i]: V[i] for i in range(n)},
        'estimatedTh':    {net['energized'][i]: math.degrees(th[i]) for i in range(n)},
    }
