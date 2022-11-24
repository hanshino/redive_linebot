
FROM --platform=linux/x86_64 python:3.9-slim

LABEL Name="redive影像辨識"
LABEL description="機器人影像辨識模組"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

WORKDIR /application

COPY requirement.txt .

RUN apt-get update && apt-get -y install \
  tesseract-ocr \
  libgl1-mesa-glx \
  && rm -rf /var/lib/apt/lists/* \
  && pip install -r requirement.txt

COPY . .

CMD [ "python", "app.py" ]

EXPOSE 3000