"""把图纸点位分解成 XYZ 阵列参数（纯 Python，无依赖）。配合 gn_xyz_array.py 使用。

点格式：(x, y, sx, sy)——单元中心坐标（米）与单元尺寸（资产局部 X 长、Y 深）。

- split_runs(pts, axis)：沿一个轴把点拆成“等距 + 同尺寸”的连续段（货架列 → 段）。
- pair_back_to_back(col_a, col_b, axis)：两列背靠背时，找出位置、数量、尺寸都相同的段，可以合成 Y数量=2。
- rectangles(pts)：把一块网格点（托盘区块）贪心分解成最大完整矩形 [(起点, nx, dx, ny, dy)]。

运行 `python xyz_decompose.py --self-test` 自检。
"""
import sys

TOL = 0.03


def split_runs(pts, axis=0, tol=TOL, max_gap=3.0):
    pts = sorted(pts, key=lambda p: p[axis])
    if not pts:
        return []
    out, cur = [], [pts[0]]
    same = lambda a, b: abs(a[2] - b[2]) < tol and abs(a[3] - b[3]) < tol
    for p in pts[1:]:
        step = p[axis] - cur[-1][axis]
        if len(cur) == 1:
            ok = same(p, cur[0]) and step < max_gap
        else:
            ok = same(p, cur[0]) and abs(step - (cur[1][axis] - cur[0][axis])) < tol
        if ok:
            cur.append(p)
        else:
            out.append(cur); cur = [p]
    out.append(cur)
    return out


def run_params(run, axis=0):
    """段 → (起点, 数量, 间距)；单个点时间距取单元长。"""
    n = len(run)
    d = run[1][axis] - run[0][axis] if n > 1 else run[0][2]
    return run[0], n, d


def pair_back_to_back(col_a, col_b, axis=1):
    """返回 [(段, 2)] + [(仅A的段, 1)] + [(仅B的段, 1)]；段的 key = (起点, 数量, 单元长)。"""
    key = lambda r: (round(r[0][axis], 2), len(r), round(r[0][2], 2))
    A = {key(r): r for r in split_runs(col_a, axis)}
    B = {key(r): r for r in split_runs(col_b, axis)}
    return [(A[k], 2) for k in A if k in B] + [(A[k], 1) for k in A if k not in B] + [(B[k], 1) for k in B if k not in A]


def rectangles(pts, tol=TOL):
    left = set(tuple(p) for p in pts)

    def find(x, y):
        for p in left:
            if abs(p[0] - x) < tol and abs(p[1] - y) < tol:
                return p

    out = []
    while left:
        s = min(left, key=lambda p: (round(p[1], 2), p[0]))
        dx = min((p[0] - s[0] for p in left if abs(p[1] - s[1]) < tol and p[0] > s[0] + tol), default=None)
        row = [s]
        if dx:
            while True:
                q = find(row[-1][0] + dx, s[1])
                if q and abs(q[2] - s[2]) < tol:
                    row.append(q)
                else:
                    break
        dy = min((p[1] - s[1] for p in left if abs(p[0] - s[0]) < tol and p[1] > s[1] + tol), default=None)
        grid = [row]
        if dy:
            while True:
                nxt = [find(p[0], p[1] + dy * len(grid)) for p in row]
                if all(nxt) and all(abs(q[2] - s[2]) < tol for q in nxt):
                    grid.append(nxt)
                else:
                    break
        for r in grid:
            for p in r:
                left.discard(p)
        out.append((s, len(row), dx or s[2], len(grid), dy or s[3]))
    return out


def _self_test():
    col = [(0, y, 2.48, 1.0) for y in (0, 2.39, 4.78)] + [(0, 6.6, 1.288, 1.0)] + [(0, y, 2.48, 1.0) for y in (12, 14.39)]
    runs = split_runs(col, axis=1)
    assert [len(r) for r in runs] == [3, 1, 2], [len(r) for r in runs]
    pr = pair_back_to_back(col, [(1.3, p[1], p[2], p[3]) for p in col], axis=1)
    assert sorted(n for _, n in pr) == [2, 2, 2]
    L = [(x * 1.3, y * 1.1, 1.2, 1.0) for x in range(3) for y in range(2)] + [(0, 2.2, 1.2, 1.0)]
    R = rectangles(L)
    assert sum(r[1] * r[3] for r in R) == 7 and len(R) == 2, R
    print("self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        print(__doc__)
