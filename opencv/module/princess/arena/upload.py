from module.princess import unitproc
from module.image import proc
import cv2


def process(img_data):
    char_result = {"attack": [], "defense": []}
    report = proc.preprocessing(img_data)  # 中央視窗裁剪
    teams = proc.upload_processing(report)  # 傷害報告類型圖片處理
    if len(teams) == 0:
        return None

    for type, team in teams:
        team = unitproc.process(report)  # 角色頭像鎖定
        if len(team) == 0:
            return None
        for char in team:
            objUnit = unitproc.unit(char["unit_head"])
            objUnit.detect()
            result = objUnit.getResult()
            if result == False:
                print("找不到這角色")
            else:
                char_result[type].append(result)

    return char_result
