from module.princess import unitproc
from module.image import proc
import cv2


def process(img_data):
    char_result = {"left": {"result": -1, "team": []},
                   "right": {"result": -1, "team": []}}
    result_length = {"left": 0, "right": 0}
    report = proc.preprocessing(img_data)  # 中央視窗裁剪
    teams = proc.upload_processing(report)  # 傷害報告類型圖片處理
    if len(teams) == 0:
        return None

    types = ["left", "right"]
    for side in types:
        team = unitproc.process(teams[side])  # 角色頭像鎖定
        if len(team) == 0:
            return None
        for char in team:
            objUnit = unitproc.unit(char["unit_head"])
            objUnit.detect()
            result = objUnit.getResult()
            if result == False:
                print("找不到這角色")
            else:
                char_result[side]["team"].append(result)

        result_length[side] = getResult(teams[side + "Result"])


    if (result_length["right"] > result_length["left"]):
        char_result["right"]["result"] = 0
        char_result["left"]["result"] = 1
    else:
        char_result["right"]["result"] = 1
        char_result["left"]["result"] = 0

    return char_result


def getResult(resultImage):
    blur = cv2.GaussianBlur(resultImage, (15, 15), 0)
    edge = cv2.Canny(blur, 20, 160)

    contours, _ = cv2.findContours(
        edge, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    xList = []
    yList = []

    for contour in contours:
        (x, y, width, height) = cv2.boundingRect(contour)
        xList += [x, x+width]
        yList += [y, y+height]
        # cv2.rectangle(resultImage, (x, y), (x+width, y+height), 0, 2)

    top_left = (min(xList), min(yList))
    bottom_right = (max(xList), max(yList))
    width = bottom_right[0] - top_left[0]
    # cv2.rectangle(resultImage, top_left, bottom_right, 0, 2)
    # cv2.drawContours(resultImage, contours, -1, (0, 255, 0), 3)
    # cv2.imshow("resultImage", resultImage)
    # cv2.waitKey(0)
    return width
