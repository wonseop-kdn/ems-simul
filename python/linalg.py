"""
선형 연립방정식 풀이 — 가우스 소거법 (Gaussian Elimination)
외부 라이브러리(numpy) 없이 직접 구현
"""


def solve_linear(A: list, b: list) -> list:
    """
    Ax = b 풀기 (가우스 소거 + 후진 대입)
    A: n×n 행렬, b: 길이 n 벡터
    반환: x (길이 n 벡터)
    """
    n = len(b)
    # 증강행렬 구성
    M = [A[i][:] + [b[i]] for i in range(n)]

    # 전진 소거
    for col in range(n):
        # 피벗 선택 (부분 피벗팅)
        max_row = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[max_row] = M[max_row], M[col]
        pivot = M[col][col]
        if abs(pivot) < 1e-15:
            raise ValueError(f"행렬이 특이(singular)합니다. col={col}")
        for row in range(col+1, n):
            factor = M[row][col] / pivot
            for k in range(col, n+1):
                M[row][k] -= factor * M[col][k]

    # 후진 대입
    x = [0.0]*n
    for i in range(n-1, -1, -1):
        x[i] = M[i][n]
        for j in range(i+1, n):
            x[i] -= M[i][j] * x[j]
        x[i] /= M[i][i]

    return x
