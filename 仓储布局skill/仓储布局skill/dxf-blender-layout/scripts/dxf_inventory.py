"""DXF 首次走查工具（需要 ezdxf、matplotlib；建议在独立 venv 中安装）。

子命令：
  stats   <dxf>                                  实体/图层/块使用统计、单位、范围
  texts   <dxf> [--region x0 x1 y0 y1]           文字（含 MTEXT）位置、字高、图层，按字高降序
  inserts <dxf> --region x0 x1 y0 y1 --out f.json  区域内块插入：句柄、块名、动态块原名、图层、插入点、旋转、镜像、求值包围盒
  render  <dxf> --region x0 x1 y0 y1 --out f.png   区域渲染预览（只绘制包围盒完全落在区域附近的顶层实体）
  scatter <dxf> --out f.png                      顶层实体中心散点图，用于找多个楼层/视图的分块

坐标单位即 DXF 单位（常见为 mm）。大文件读取约 10s/100MB，结果请保存复用，不要反复全量扫描。
"""
import argparse, collections, json, sys


def load(path):
    import ezdxf
    return ezdxf.readfile(path)


def dyn_name(doc, block_name):
    """解析匿名动态块 *Uxxx 的原始块名：块记录 xdata AcDbBlockRepBTag 的 1005 句柄指向原块记录。"""
    br = doc.block_records.get(block_name)
    if br is None:
        return None
    try:
        for code, val in br.get_xdata("AcDbBlockRepBTag"):
            if code == 1005:
                h = doc.entitydb.get(val)
                if h is not None:
                    return h.dxf.name
    except Exception:
        pass
    return None


def ent_box(e):
    from ezdxf import bbox
    try:
        b = bbox.extents([e], fast=True)
        return b if b.has_data else None
    except Exception:
        return None


def in_region(b, r, pad=0):
    x0, x1, y0, y1 = r
    c = b.center
    return x0 - pad < c.x < x1 + pad and y0 - pad < c.y < y1 + pad


def cmd_stats(a):
    doc = load(a.dxf); msp = doc.modelspace()
    print("version", doc.dxfversion, "INSUNITS", doc.header.get("$INSUNITS"), "(4=mm, 6=m)")
    print("extents", doc.header.get("$EXTMIN"), doc.header.get("$EXTMAX"))
    print("types", collections.Counter(e.dxftype() for e in msp).most_common())
    print("layers", collections.Counter(e.dxf.layer for e in msp).most_common(80))
    ins = collections.Counter(e.dxf.name for e in msp.query("INSERT"))
    print("blocks", [(k, dyn_name(doc, k), v) for k, v in ins.most_common(120)])
    print("layouts", [l.name for l in doc.layouts])


def cmd_texts(a):
    doc = load(a.dxf)
    rows = []
    for e in doc.modelspace().query("TEXT MTEXT"):
        t = e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text
        p = e.dxf.insert
        if a.region and not (a.region[0] < p.x < a.region[1] and a.region[2] < p.y < a.region[3]):
            continue
        h = getattr(e.dxf, "height", 0) or getattr(e.dxf, "char_height", 0)
        rows.append((h, p.x, p.y, e.dxf.layer, t.replace("\n", " ")[:100]))
    for h, x, y, l, t in sorted(rows, reverse=True):
        print(f"{x:12.0f} {y:12.0f} h={h:6.0f} [{l}] {t}")


def cmd_inserts(a):
    doc = load(a.dxf)
    out = []
    for e in doc.modelspace().query("INSERT"):
        b = ent_box(e)
        if b is None or not in_region(b, a.region):
            continue
        out.append(dict(handle=e.dxf.handle, block=e.dxf.name, dyn=dyn_name(doc, e.dxf.name), layer=e.dxf.layer,
                        ix=round(e.dxf.insert.x, 1), iy=round(e.dxf.insert.y, 1), rot=round(e.dxf.rotation, 3),
                        sx=e.dxf.xscale, sy=e.dxf.yscale, cx=round(b.center.x, 1), cy=round(b.center.y, 1),
                        w=round(b.size.x, 1), d=round(b.size.y, 1), h=round(b.size.z, 1), zmin=round(b.extmin.z, 1)))
    json.dump(out, open(a.out, "w"), ensure_ascii=False)
    c = collections.Counter((r["block"], r["dyn"], r["layer"], r["w"], r["d"]) for r in out)
    for k, v in c.most_common(100):
        print(v, k)
    print("total", len(out), "->", a.out)


def _setup_mpl():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.sans-serif"] = ["PingFang SC", "Arial Unicode MS", "SimHei", "Noto Sans CJK SC"]
    return plt


def cmd_render(a):
    plt = _setup_mpl()
    from ezdxf.addons.drawing import RenderContext, Frontend
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
    from ezdxf.addons.drawing.config import Configuration, BackgroundPolicy
    doc = load(a.dxf)
    x0, x1, y0, y1 = a.region
    pad = max(x1 - x0, y1 - y0) * 0.05
    ents = []
    for e in doc.modelspace():
        b = ent_box(e)
        if b and b.extmin.x > x0 - pad and b.extmax.x < x1 + pad and b.extmin.y > y0 - pad and b.extmax.y < y1 + pad:
            ents.append(e)
    fig = plt.figure(figsize=(30, 30 * (y1 - y0) / (x1 - x0)))
    ax = fig.add_axes([0, 0, 1, 1])
    Frontend(RenderContext(doc), MatplotlibBackend(ax),
             config=Configuration(background_policy=BackgroundPolicy.WHITE)).draw_entities(ents)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect("equal")
    fig.savefig(a.out, dpi=70)
    print(len(ents), "entities ->", a.out)


def cmd_scatter(a):
    plt = _setup_mpl()
    doc = load(a.dxf)
    xs, ys = [], []
    for e in doc.modelspace():
        b = ent_box(e)
        if b:
            xs.append(b.center.x); ys.append(b.center.y)
    fig, ax = plt.subplots(figsize=(16, 16))
    ax.scatter(xs, ys, s=1); ax.set_aspect("equal"); ax.grid(alpha=.3)
    fig.savefig(a.out, dpi=60)
    print(len(xs), "->", a.out)


def main(argv=None):
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    for name in ("stats", "texts", "inserts", "render", "scatter"):
        q = sp.add_parser(name); q.add_argument("dxf")
        q.add_argument("--region", nargs=4, type=float, required=name in ("inserts", "render"))
        q.add_argument("--out", required=name in ("inserts", "render", "scatter"))
    a = p.parse_args(argv)
    globals()["cmd_" + a.cmd](a)


if __name__ == "__main__":
    main()
