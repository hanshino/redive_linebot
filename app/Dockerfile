FROM node:12-alpine

LABEL Name="redive機器人核心"
LABEL description="機器人語言組，分析所有訊息，進行功能響應"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

WORKDIR /application

COPY package*.json ./

RUN yarn install

COPY . .

CMD [ "npm", "start" ]

EXPOSE 5000