"""二维布局数学：块基点补偿、嵌套块矩阵、点在多边形内检查。纯 Python，无依赖。

不解析 DXF、不处理 OCS（拉伸方向非 +Z 的实体需先转换到 WCS）、不生成 Blender 场景，
也不能替代实际轮廓相交检查。运行 `python layout_math.py --self-test` 自检。
"""
import math
import sys


def mat_insert(ix, iy, rot_deg=0.0, sx=1.0, sy=1.0, bx=0.0, by=0.0):
    """INSERT 的 3x3 仿射矩阵：WCS = T(insert) · R(rot) · S(sx,sy) · T(-block_base)。"""
    r = math.radians(rot_deg)
    c, s = math.cos(r), math.sin(r)
    a, b = c * sx, -s * sy
    d, e = s * sx, c * sy
    tx = ix - (a * bx + b * by)
    ty = iy - (d * bx + e * by)
    return [[a, b, tx], [d, e, ty], [0.0, 0.0, 1.0]]


def mat_mul(m, n):
    return [[sum(m[i][k] * n[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def nested(*mats):
    """嵌套块：外层在前，mats = (外层INSERT矩阵, 内层INSERT矩阵, ...)。"""
    out = [[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]
    for m in mats:
        out = mat_mul(out, m)
    return out


def apply(m, x, y):
    return (m[0][0] * x + m[0][1] * y + m[0][2], m[1][0] * x + m[1][1] * y + m[1][2])


def decompose(m):
    """返回 (tx, ty, rot_deg, sx, sy, mirrored)。镜像归入 sy<0。"""
    a, b, d, e = m[0][0], m[0][1], m[1][0], m[1][1]
    sx = math.hypot(a, d)
    rot = math.degrees(math.atan2(d, a))
    det = a * e - b * d
    sy = det / sx if sx else 0.0
    return m[0][2], m[1][2], rot, sx, sy, det < 0


def local_bbox_center_to_world(m, bbox_local):
    """块内几何局部包围盒中心 → WCS 中心（插入点 ≠ 几何中心时用）。"""
    (x0, y0), (x1, y1) = bbox_local
    return apply(m, (x0 + x1) / 2, (y0 + y1) / 2)


def point_in_polygon(x, y, poly):
    """射线法；边界上的点视为在内。poly: [(x,y),...] 不需闭合。"""
    n = len(poly)
    inside = False
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        # 边界
        if min(x1, x2) - 1e-9 <= x <= max(x1, x2) + 1e-9 and min(y1, y2) - 1e-9 <= y <= max(y1, y2) + 1e-9:
            if abs((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) < 1e-9:
                return True
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xi:
                inside = not inside
    return inside


def _self_test():
    ok = lambda a, b: abs(a - b) < 1e-6
    m = mat_insert(100, 50, 90)
    x, y = apply(m, 10, 0); assert ok(x, 100) and ok(y, 60)
    m = mat_insert(0, 0, 0, sx=-1)            # 镜像
    x, y = apply(m, 5, 2); assert ok(x, -5) and ok(y, 2)
    assert decompose(m)[5] is True
    m = mat_insert(0, 0, 0, bx=10, by=10)     # 块基点补偿
    x, y = apply(m, 10, 10); assert ok(x, 0) and ok(y, 0)
    outer = mat_insert(1000, 0, 90); inner = mat_insert(100, 0, 0)
    x, y = apply(nested(outer, inner), 0, 0); assert ok(x, 1000) and ok(y, 100)
    tx, ty, r, sx, sy, mir = decompose(mat_insert(3, 4, 30, 2, 2)); assert ok(r, 30) and ok(sx, 2) and not mir
    # 本项目实测：堆垛机块 rot=90, sx=-1：局部 +Y → 世界 -X
    x, y = apply(mat_insert(0, 0, 90, sx=-1), 0, 1); assert ok(x, -1) and ok(y, 0)
    sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert point_in_polygon(5, 5, sq) and not point_in_polygon(15, 5, sq) and point_in_polygon(10, 5, sq)
    print("self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        print(__doc__)
