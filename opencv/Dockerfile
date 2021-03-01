
FROM python:3.9-slim

LABEL Name="redive影像辨識"
LABEL description="機器人影像辨識模組"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

RUN apt-get update

RUN apt-get -y install tesseract-ocr libgl1-mesa-glx

WORKDIR /application

COPY requirement.txt .

RUN pip install -r requirement.txt

COPY . .

CMD [ "python", "app.py" ]

EXPOSE 3000