FROM node:12-alpine

WORKDIR /application

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "npm", "start" ]

EXPOSE 5000