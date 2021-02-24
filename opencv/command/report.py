from module.princess import unitproc
from module.image import proc
import cv2

report = cv2.imread("assets/b.png") # 讀取圖片
report = proc.preprocessing(report) # 中央視窗裁剪
report = proc.report_processing(report) # 傷害報告類型圖片處理
char_list = unitproc.process(report) # 角色頭像鎖定

for char in char_list:
    objUnit = unitproc.unit(char)
    objUnit.detect()
    result = objUnit.getResult()
    if result == False:
        print("找不到這角色")
    else:
        print(result)