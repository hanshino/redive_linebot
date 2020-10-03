FROM node:12-alpine

WORKDIR /script

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]