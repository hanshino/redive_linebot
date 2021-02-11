from module.princess import unitproc
from module.princess.guild import damage
from module.image import proc
import cv2
import numpy as np


def process(img_data):
    char_result = []
    report = proc.preprocessing(img_data)  # 中央視窗裁剪
    report = proc.report_processing(report)  # 傷害報告類型圖片處理
    char_list = unitproc.process(report)  # 角色頭像鎖定

    if len(char_list) == 0:
        return None

    positions = [char["position"] for char in char_list]
    startX = np.min(positions)

    for i in range(len(char_list)):
        char = char_list[i]
        objUnit = unitproc.unit(char["unit_head"])
        objUnit.detect()
        result = objUnit.getResult()
        if result == False:
            continue

        result["damage"] = damage.process(
            positions[i], char["unit_head"].shape, report) if positions[i][0] == startX else 0
        char_result.append(result)

    return char_result
