import cv2
import os.path
import numpy as np
import base64


def base64_to_image(strData):
    return cv2.imdecode(np.fromstring(base64.b64decode(strData), dtype=np.uint8), 1)


def get_assets_image(image_name):
    return cv2.imread(os.path.join(os.path.dirname(__file__), "../../assets", image_name), cv2.IMREAD_GRAYSCALE)


def upload_processing(img):
    height, width = img.shape[:2]
    img = img[50:height, 0:width]
    # 上傳紀錄競技場對戰紀錄的照片要二段處理
    for i in range(2):
        blur = cv2.GaussianBlur(img, (1, 1), 0)
        edge = cv2.Canny(blur, 20, 160)
        contours, _ = cv2.findContours(
            edge, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        round_length = []
        for contour in contours:
            round_length.append(cv2.arcLength(contour, True))

        (x, y, width, height) = cv2.boundingRect(
            contours[np.argmax(np.array(round_length))])

        img = img[y+5:y+height-5, x+5:x+width-5]

    x = img.shape[1]
    x_middle = round(x / 9 * 4)
    y = img.shape[0]
    upload_section = {"left": img[0:y, 0:x_middle],
                      "right": img[0:y, x_middle:x]}
    result_section = {}

    for side, section in upload_section.items():
        sH, sW = section.shape[:2]
        result_section[side +
                       "Result"] = section[0:round(sH/3), 0:round(sW/14*3)]

    return {**upload_section, **result_section}


def report_processing(img):
    # 輸入已預處理的照片
    # Input: preprocessed Image
    blur = cv2.GaussianBlur(img, (13, 13), 0)
    edge = cv2.Canny(blur, 20, 160)
    contours, _ = cv2.findContours(
        edge, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    round_length = []
    for contour in contours:
        round_length.append(cv2.arcLength(contour, True))

    (x, y, width, height) = cv2.boundingRect(
        contours[np.argmax(np.array(round_length))])
    return img[y+2:y+height-2, x+2:x+width-2]


def preprocessing(img):
    # 簡單去背,只保留主要畫面
    # Input: Original Image
    # Output: Record Image
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)  # BGR to Gray
    _, binary = cv2.threshold(
        gray, 150, 255, cv2.THRESH_TOZERO)  # Gray to Binary

    # Capture Record
    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h_threshold = 100
    result = gray

    for contour in contours:
        (x, y, width, height) = cv2.boundingRect(contour)
        if height < h_threshold:
            continue
        result = gray[y:y+height, x:x+width]
        break

    return result


def search_processing(img):
    # 固定裁剪 1/3 高度 並且保留右半邊
    height, width = img.shape[:2]
    resize_h = round(height / 3)
    resize_w = round(width / 2)
    return img[0:resize_h, resize_w:width]
