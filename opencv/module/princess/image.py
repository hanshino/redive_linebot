import cv2
import os.path

class _headImage:
    def __init__(self) -> None:
        self.images = {}
        pass

    # rarity 必定要是 1, 3, 6
    def read_image(self, char_id: int, rarity: int):
        file_name = char_id + rarity * 10
        file_path = os.path.join(os.path.dirname(
            __file__), "../../character_unit", str(file_name) + ".webp")
        if not self.images.__contains__(file_name):
            self.images[file_name] = cv2.imread(
                file_path, cv2.IMREAD_GRAYSCALE)

        return self.images.get(file_name)


HeadImage = _headImage()
