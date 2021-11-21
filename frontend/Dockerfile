# build environment
FROM node:lts as build
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
COPY package*.json ./
COPY yarn.lock ./
RUN yarn install
COPY . ./
RUN yarn build

LABEL Name="redive前端"
LABEL description="由react實作的前端頁面"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

# production environment
FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]