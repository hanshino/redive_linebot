# build environment
FROM node:14-alpine as build
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
COPY package*.json ./
RUN yarn install
RUN npm install react-scripts@3.4.1 -g --silent
COPY . ./
RUN npm run build

LABEL Name="redive前端"
LABEL description="由react實作的前端頁面"
LABEL version="1.0"
LABEL maintainer="hanshino@github"

# production environment
FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]