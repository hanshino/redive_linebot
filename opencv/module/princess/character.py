from module.princess import connect, image
import numpy as np
import cv2
import os

def get_all_characters() -> list:
    curr = connect.get()
    curr.execute("SELECT p.unit_id, max(rarity) as max_rarity, p.unit_name as name FROM unit_rarity r JOIN unit_profile p on r.unit_id = p.unit_id GROUP BY r.unit_id")
    return curr.fetchall()


def get_character_image(char_dict: dict) -> list:
    images = list()
    image_rarity = [1, 3]
    if char_dict["max_rarity"] == 6:
        image_rarity.append(6)

    for i in range(len(image_rarity)):
        images.append(image.HeadImage.read_image(
            char_dict["unit_id"], image_rarity[i]))

    return images


def get_full_image_info():
    char_list = get_all_characters()
    result = []

    for char in char_list:
        rarity = [1, 3]
        if char["max_rarity"] == 6:
            rarity.append(6)

        for rare in rarity:
            char["rarity"] = rare
            result += [char]

    return [result[i:i+10] for i in range(0, len(result), 10)]


def get_character_full_image(re_generate=False):
    cache_file = os.path.join(os.path.dirname(__file__), "../../character_full.npy")
    if not re_generate and os.path.exists(cache_file):
        return np.load(cache_file)

    char_list = get_all_characters()
    template = []
    x_template = []

    for char in char_list:
        template += get_character_image(char)

    blank_images = []
    for i in range(10 - len(template) % 10):
        blank_image = np.zeros(
            (template[0].shape[1], template[0].shape[0], 3), np.uint8)
        blank_images.append(cv2.cvtColor(blank_image, cv2.COLOR_BGR2GRAY))
    template += blank_images

    two_template = [template[i:i+10] for i in range(0, len(template), 10)]

    for i in range(len(two_template)):
        x_template.append(cv2.hconcat(two_template[i]))
        
    result = cv2.vconcat(x_template)
    np.save(cache_file, result)
    return result
