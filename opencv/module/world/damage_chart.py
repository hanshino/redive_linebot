import os
from typing import List
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import base64
from io import BytesIO

FONT_PATH = os.path.join(os.path.dirname(__file__), "TaipeiSansTCBeta-Regular.ttf")
FONT_PROP = fm.FontProperties(fname=FONT_PATH)


def process(data: List[dict]):
    labels, sizes, explode = [], [], []
    other_damages = 0

    for i in data:
        if len(labels) < 10:
            labels.append(i.get("display_name", "路人"))
            sizes.append(i.get("total_damage"))
            explode.append(0)
        else:
            other_damages += i.get("total_damage")

    if other_damages > 0:
        labels.append("其他")
        sizes.append(other_damages)
        explode.append(0)

    fig, ax = plt.subplots()
    ax.pie(
        sizes,
        explode=explode,
        labels=labels,
        autopct="%1.1f%%",
        startangle=90,
        textprops={"fontsize": 12, "fontproperties": FONT_PROP},
    )
    ax.axis("equal")

    pic_IObytes = BytesIO()
    plt.savefig(pic_IObytes, format="png")
    pic_IObytes.seek(0)

    return base64.b64encode(pic_IObytes.read()).decode("utf-8")