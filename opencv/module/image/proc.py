import cv2
import os.path
import numpy as np
import base64


def base64_to_image(strData):
    return cv2.imdecode(np.fromstring(base64.b64decode(strData), dtype=np.uint8), 1)


def get_assets_image(image_name):
    return cv2.imread(os.path.join(os.path.dirname(__file__), "../../assets", image_name), cv2.IMREAD_GRAYSCALE)


def upload_processing(img):
    width, height = img.shape[:2]
    img = img[0:width, 10:height]
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

# 輸入已預處理的照片
# Input: preprocessed Image


def report_processing(img):
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


# 簡單去背,只保留主要畫面
# Input: Original Image
# Output: Record Image


def preprocessing(img):
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


def is_arena_img(img):
    return True if img.shape[0] < img.shape[1] else False

# Battle Result
# Input: Record Image
# Output: Our Win or Lose


def battle_result(img, mode):

    result = None
    win_template = None
    lose_template = None

    if mode == 'upload':
        win_template = get_assets_image("win.jpg")
    elif mode == 'friend_upload':
        win_template = get_assets_image("friend_win.jpg")
    elif mode == '3v3':
        win_template = get_assets_image("3v3_win.jpg")

    win_res = cv2.matchTemplate(win_template, img, cv2.TM_SQDIFF)
    win_min_val, _, win_min_loc, _ = cv2.minMaxLoc(win_res)

    if mode == 'upload':
        lose_template = get_assets_image("lose.jpg")
    elif mode == 'friend_upload':
        lose_template = get_assets_image("friend_lose.jpg")
    elif mode == '3v3':
        lose_template = get_assets_image("3v3_lose.jpg")

    lose_res = cv2.matchTemplate(lose_template, img, cv2.TM_SQDIFF)
    _, _, lose_min_loc, _ = cv2.minMaxLoc(lose_res)

    if win_min_val > 2e6:
        return (0, 0), lose_min_loc, result

    if win_min_loc[0] < int(img.shape[1]/3):
        result = True
    else:
        result = False

    return win_min_loc, lose_min_loc, result


# Image Preprocessing
# Input: Record Image
# Output: Battle Results
def upload_battle_processing(img, region, mode):

    # result = None
    win_min_loc, lose_min_loc, result = battle_result(img, mode)

    win_des = 1
    if region == 'china':
        lose_des = 8
        y = 140
    else:
        lose_des = 7
        y = 150

    # Width and Height of Cropped region
    w = 60
    h = 40
    border = 5

    # Our team Character
    if mode == 'friend_upload':
        y = 110
    if result == True:
        x = win_min_loc[0] + win_des
    else:
        x = lose_min_loc[0] + lose_des

    team = []
    for i in range(5):
        crop_img = img[y:y+h, x+border:x+w-border]
        team.append(crop_img)
        if mode == 'friend_upload':
            y = y + h + 30
        else:
            x = x + w + 7

    # Enemy team Character
    if mode == 'friend_upload':
        y = 110
    if result == True:
        x = lose_min_loc[0] + lose_des
    else:
        x = win_min_loc[0] + win_des

    enemy = []
    for i in range(5):
        crop_img = img[y:y + h, x + border:x + w - border]
        enemy.append(crop_img)
        if mode == 'friend_upload':
            y = y + h + 30
        else:
            x = x + w + 7

    return team, enemy, result


# Image Preprocessing
# Input: Record Image
# Output: Battle Results
def search_battle_processing(img):

    x = 552
    y = 27
    # Width and Height of Cropped region
    w = 60
    h = 37

    # Enemy team Character
    enemy = []
    for i in range(5):
        crop_img = img[y:y+h, x:x+w]
        crop_img = cv2.resize(crop_img, (60, 60),
                              interpolation=cv2.INTER_CUBIC)
        crop_img = crop_img[15:50, 10:50]
        enemy.append(crop_img)
        x = x+w+7

    return enemy
