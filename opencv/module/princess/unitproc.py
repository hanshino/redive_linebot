import cv2
from module.princess import character
import math
import numpy as np

# 頭像處理


def process(img) -> list:
    edge = cv2.Canny(img, 20, 160)

    contours, _ = cv2.findContours(
        edge, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    probably_list = []

    for contour in contours:
        (x, y, width, height) = cv2.boundingRect(contour)

        if height == 0 or width == 0:
            continue

        slope = width / height

        if height >= 50 and width >= 50 and round(abs(slope*10 - 10)) < 1:
            unit_head = img[y:y+height, x:x+width]
            probably_list.append({"unit_head": unit_head, "position": (x, y)})

    return probably_list


def fix_unit_image(unit_image):
    # 統一進行裁剪 40%資訊
    width, height = unit_image.shape[1], unit_image.shape[0]
    w_cut_val, h_cut_val = round(width * 0.2), round(height * 0.45)
    w_start, w_end = 0 + round(w_cut_val/2), width - round(w_cut_val/2)
    h_start, h_end = 0 + round(h_cut_val/2), width - round(h_cut_val/2)
    return unit_image[h_start:h_end, w_start:w_end]


class unit:
    def __init__(self, unitHeadImage) -> None:
        compressRate = (1, 1)   # 預設
        width, height = unitHeadImage.shape[:2]
        fullCharImage = character.get_character_full_image()

        # 將大圖壓縮跟頭像同比例
        (fullHeight, fullWidth) = fullCharImage.shape[:2]
        compressRate = height/128, width/128
        resizeFullHeight, resizeFullWidth = round(
            fullHeight * compressRate[0]), round(fullWidth * compressRate[1])

        self.resizeFullImage = cv2.resize(
            fullCharImage, (resizeFullWidth, resizeFullHeight), cv2.INTER_NEAREST)
        self.resizeFullSize = self.resizeFullImage.shape[:2]
        self.fixedUnit = fix_unit_image(unitHeadImage)
        self.fixedSize = self.fixedUnit.shape[:2]
        self.compressRate = compressRate
        self.threshold = 5200000

        pass

    def detect(self):
        res = cv2.matchTemplate(self.resizeFullImage,
                                self.fixedUnit, cv2.TM_SQDIFF)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
        # print("#%d" % (1), min_val)
        top_left = min_loc
        # bottom_right = (top_left[0] + self.fixedUnit.shape[1],
        #                 top_left[1] + self.fixedUnit.shape[0])

        if min_val > self.threshold:
            self.target = (0, 0)
            return

        self.target = round(
            top_left[0]+self.fixedSize[1]/2), round(top_left[1]+self.fixedSize[0]/2)

        # cv2.rectangle(self.resizeFullImage, top_left, bottom_right, 0, 2)
        # cv2.putText(self.resizeFullImage, "#%d" % (
        #     1), (top_left[0], top_left[1]+20), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 0), 3)

        # cv2.imshow("detect", cv2.resize(self.resizeFullImage, (round(
        #     self.resizeFullImage.shape[1]*0.2), round(self.resizeFullImage.shape[0]*0.2)), cv2.INTER_NEAREST))
        # cv2.waitKey(0)

    def getResult(self) -> dict:
        if self.target[0] == 0 or self.target[1] == 0:
            return False

        fullImageInfo = character.get_full_image_info()
        xLength, yLength = 10, len(fullImageInfo)
        fullUnitX, fullUnitY = self.resizeFullSize[1] / \
            xLength, self.resizeFullSize[0] / yLength

        xIdx, yIdx = math.floor(
            self.target[0] / fullUnitX), math.floor(self.target[1] / fullUnitY)

        # print("================")
        # print("resize", self.resizeFullSize)
        # print("fullUnitX",fullUnitX, fullUnitY)
        # print("target",self.target[0], self.target[1])
        # print("xLength",xLength, yLength)
        # print("xIdx",xIdx, yIdx)
        # print("================")

        return fullImageInfo[yIdx][xIdx]
