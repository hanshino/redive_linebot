FROM node:12-alpine

WORKDIR /script

COPY package*.json ./

RUN yarn install

COPY . .

CMD ["npm", "start"]