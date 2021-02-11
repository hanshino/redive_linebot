
FROM python:3.9-slim

RUN apt-get update

RUN apt-get -y install tesseract-ocr libgl1-mesa-glx

WORKDIR /application

COPY requirement.txt .

RUN pip install -r requirement.txt

COPY . .

CMD [ "python", "app.py" ]

EXPOSE 3000