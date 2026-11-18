"""按设备清单 CSV 画编号预览 PNG：分组着色矩形 + 分组粗体标签 + 待确认项红字编号 + 图例。

只依赖 matplotlib，不读 DXF。CSV 需要这些列：
编号, 分组, 说明, 处理, 中心X_m, 中心Y_m, 长X_m, 宽Y_m
"处理"为"排除"的行不画；"待确认"的行在中心标红色编号。

用法：
  python preview_numbered.py 1F设备清单.csv --out 1F编号预览.png \
      --title "1F 设备分组预览（单位 m，原点=DXF(1660000,110000)mm）"
"""
import argparse, csv


def _setup_mpl():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.sans-serif"] = ["PingFang SC", "Arial Unicode MS", "SimHei", "Noto Sans CJK SC"]
    plt.rcParams["axes.unicode_minus"] = False
    return plt


def draw(csv_path, out, title=None, dpi=90, width=28.0):
    plt = _setup_mpl()
    from matplotlib.patches import Rectangle
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    rows = [r for r in rows if r.get("处理") != "排除"]
    if not rows:
        raise SystemExit("没有可画的行（全部被排除或 CSV 为空）")

    # 分组超过 20 个时接 tab20b，避免颜色重复
    groups = sorted(set(r["分组"] for r in rows))
    palette = [plt.get_cmap("tab20")(i) for i in range(20)] + [plt.get_cmap("tab20b")(i) for i in range(20)]
    cols = {g: palette[i % len(palette)] for i, g in enumerate(groups)}

    boxes = []
    for r in rows:
        x, y = float(r["中心X_m"]), float(r["中心Y_m"])
        w, d = float(r["长X_m"] or 0), float(r["宽Y_m"] or 0)
        boxes.append((r, x, y, max(w, 0.2), max(d, 0.2)))

    # 画布高度跟随平面长宽比，减少上下留白
    xs0 = min(x - w / 2 for _, x, _, w, _ in boxes); xs1 = max(x + w / 2 for _, x, _, w, _ in boxes)
    ys0 = min(y - d / 2 for _, _, y, _, d in boxes); ys1 = max(y + d / 2 for _, _, y, _, d in boxes)
    aspect = (ys1 - ys0) / max(xs1 - xs0, 1e-6)
    fig, ax = plt.subplots(figsize=(width, min(max(width * aspect + 2, 8), width * 1.5)))

    first = {}
    for r, x, y, w, d in boxes:
        g = r["分组"]
        ax.add_patch(Rectangle((x - w / 2, y - d / 2), w, d, fc=cols[g], ec="k", lw=0.2, alpha=0.8,
                               label=None if g in first else f"{g} {r.get('说明', '')}"))
        first.setdefault(g, (x, y))
        if r.get("处理") == "待确认":
            ax.annotate(r["编号"], (x, y), fontsize=6, color="red")
    for g, (x, y) in first.items():
        ax.annotate(g, (x, y), fontsize=11, weight="bold", color="k")

    ax.set_aspect("equal"); ax.autoscale(); ax.grid(alpha=.3)
    ax.legend(loc="upper left", bbox_to_anchor=(1, 1), fontsize=10)
    ax.set_title(title or "设备分组预览（单位 m）", fontsize=14)
    fig.tight_layout(); fig.savefig(out, dpi=dpi)
    print(len(boxes), "items,", len(groups), "groups ->", out)


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("csv")
    p.add_argument("--out", required=True)
    p.add_argument("--title")
    p.add_argument("--dpi", type=int, default=90)
    p.add_argument("--width", type=float, default=28.0, help="画布宽度（英寸）")
    a = p.parse_args(argv)
    draw(a.csv, a.out, a.title, a.dpi, a.width)


if __name__ == "__main__":
    main()
