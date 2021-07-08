FROM node:12-alpine

LABEL Name="redive排程"
LABEL description="協助redive機器人運作"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

WORKDIR /script

COPY package*.json ./
COPY yarn.lock ./

RUN yarn install

COPY . .

CMD ["npm", "start"]