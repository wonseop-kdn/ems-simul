// ─────────────────────────────────────────────────────────────────────────────
//  경량 선형대수 유틸 (소규모 밀집 행렬용)
// ─────────────────────────────────────────────────────────────────────────────

export type Matrix = number[][];

/** A·x = b 를 부분 피벗 가우스 소거법으로 해석 */
export function solveLinear(A: Matrix, b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-13) {
      throw new Error('Singular matrix in solveLinear');
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const pv = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / pv;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

export function transpose(A: Matrix): Matrix {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const T = zeros(cols, rows);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) T[j][i] = A[i][j];
  return T;
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[p][j];
    }
  }
  return C;
}

export function matVec(A: Matrix, x: number[]): number[] {
  return A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
}

/** 대칭 양정치(가정) 정방행렬의 역행렬 (가우스-조던) */
export function invert(A: Matrix): Matrix {
  const n = A.length;
  const M = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-13) {
      throw new Error('Singular matrix in invert');
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const pv = M[col][col];
    for (let c = 0; c < 2 * n; c++) M[col][c] /= pv;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row.slice(n));
}
