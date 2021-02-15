import re
import pytesseract
from PIL import Image
import cv2
import numpy as np
import math
from module.image import proc
from module.princess import unitproc

#   第一位角色的左上角座標 pos1 = [X,Y], 第二位角色的左下角座標 pos2 = [X,Y]


def main(position, unit_size, img):
    x, y = position
    w, h = unit_size[:2]
    print(x, y, w, h)
    w = w * 4
    crop_img = img[y:y+h, x:x+w]
    cv2.imshow("crop", crop_img)

    custom_config = r'digits'
    damage = pytesseract.image_to_string(crop_img, config=custom_config)
    return damage

def process(pos1, pos2, img):
    #   角色頭像尺寸比例 X:Y = 5:1
    Y = pos1[1] - pos2[1]
    X = math.floor(Y*5)
    # 比例 裁切區域的 x 與 y 座標（左上角）
    x = math.floor(pos1[0])
    y = math.floor(pos1[1])
    print(y)
    # 裁切區域的長度與寬度
    w = abs(math.floor(X))
    h = abs(math.floor(Y))

    # 位移量
    move = abs(math.floor(Y*1.4))

    # return 上到下依序
    result = []
    for i in range(5):

        # 裁切圖片
        crop_img = img[y:y+h, x:x+w]
        print(x, y)
        cv2.imshow("123", crop_img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
        # 抓圖片文字
        # Adding custom options
        custom_config = r'digits'
        damage = pytesseract.image_to_string(crop_img, config=custom_config)
        damage = re.search('\d{2,}', damage)
        result.append(damage.group())
        # 加上位移量
        y = y+move

    print(result)
    return result


if __name__ == "__main__":
    img = cv2.imread("assets/report2.jpg")
    report = proc.preprocessing(img)
    report = proc.report_processing(report)
    char_list = unitproc.process(report)

    for char in char_list:
        print(char["position"])

    positions = [char["position"] for char in char_list]
    startX = np.min(positions)
    positions = [pos for pos in positions if pos[0] == startX]

    print(positions)

    result = main(positions[2], char_list[2]["unit_head"].shape, report)
    print(result)
    # cv2.imshow("test", report)
    cv2.waitKey(0)
