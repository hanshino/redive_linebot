import pytesseract
import re

def process(position, unit_size, img):
    x, y = position
    w, h = unit_size[:2]
    crop_img = img[y+15:y+h-10, x+w:x+w*4]

    custom_config = r'digits'
    str_damage = pytesseract.image_to_string(crop_img, config=custom_config)
    damages = re.findall(r'\d+', str_damage)
    damages = [int(d) for d in damages]
    return max(damages)