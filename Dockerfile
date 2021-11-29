FROM node:12.16.3

WORKDIR /usr/src/app

ENV PATH /usr/src/app/node_modules/.bin:$PATH

COPY package*.json ./

RUN npm install

ARG BUILD_NUMBER

ENV BUILD_NUMBER=$BUILD_NUMBER

COPY . .

EXPOSE 4300

ENTRYPOINT ["npm", "start"]