from module.image import proc
from module.princess import unitproc


def process(img) -> list:
    report = proc.preprocessing(img)
    report = proc.search_processing(report)
    char_list = unitproc.process(report)
    result = []

    if len(char_list) == 0:
        return None

    for char in char_list:
        objUnit = unitproc.unit(char["unit_head"])
        objUnit.detect()
        result.append(objUnit.getResult())

    return result
