FROM node:16

LABEL Name="redive機器人核心"
LABEL description="機器人語言組，分析所有訊息，進行功能響應"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

ENV NODE_ENV production

WORKDIR /application

COPY package*.json ./
COPY yarn.lock ./

RUN yarn install --production=true

COPY . .

CMD [ "npm", "start" ]

EXPOSE 5000
