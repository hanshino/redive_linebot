FROM node:lts AS build

# Install dumb-init
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
COPY yarn.lock ./

# Install dependencies with yarn
RUN yarn install --production=true

#### Build Time Finished ####

FROM node:lts-bullseye-slim

LABEL Name="redive機器人核心"
LABEL description="機器人語言組，分析所有訊息，進行功能響應"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

USER node
ENV NODE_ENV production
WORKDIR /usr/src/app

COPY --from=build /usr/bin/dumb-init /usr/bin/dumb-init
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . /usr/src/app

CMD [ "dumb-init", "yarn", "start" ]

EXPOSE 5000
