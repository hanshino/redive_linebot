import os
from typing import List
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import base64
import numpy as np
from io import BytesIO

FONT_PATH = os.path.join(os.path.dirname(
    __file__), "TaipeiSansTCBeta-Regular.ttf")
FONT_PROP = fm.FontProperties(fname=FONT_PATH)


def process(data: List[dict], boss: dict):
    labels, sizes, explode = [], [], []
    other_damages = boss.get("caused_damage")

    for i in data[0:10]:
        labels.append(i.get("display_name", "路人"))
        sizes.append(i.get("total_damage"))
        explode.append(0)
        # 排除掉前十名的傷害
        other_damages -= i.get("total_damage", 0)

    labels.append("其他")
    sizes.append(other_damages)
    explode.append(0)

    fig, ax = plt.subplots()
    wedges, texts = ax.pie(
        sizes,
        wedgeprops=dict(width=0.5),
        startangle=90,
    )
    bbox_props = dict(boxstyle="square,pad=0.3", fc="w", ec="k", lw=0.72)
    kw = dict(xycoords="data", textcoords="data", arrowprops=dict(arrowstyle="-"),
              bbox=bbox_props, zorder=0, va="center")

    for i, p in enumerate(wedges):
        ang = (p.theta2 - p.theta1)/2. + p.theta1
        y = np.sin(np.deg2rad(ang))
        x = np.cos(np.deg2rad(ang))
        horizontalalignment = {-1: "right", 1: "left"}[int(np.sign(x))]
        connectionstyle = "angle,angleA=0,angleB={}".format(ang)
        kw["arrowprops"].update({"connectionstyle": connectionstyle})
        ax.annotate(labels[i], xy=(x, y), xytext=(1.35*np.sign(x), 1.4*y),
                    horizontalalignment=horizontalalignment, **kw, fontproperties=FONT_PROP)

    ax.axis("equal")

    pic_IObytes = BytesIO()
    plt.savefig(pic_IObytes, format="png")
    pic_IObytes.seek(0)

    return base64.b64encode(pic_IObytes.read()).decode("utf-8")
