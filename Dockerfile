FROM node:22-alpine
RUN apk add --no-cache \
    git \
    ffmpeg \
    libwebp-tools \
    python3 \
    make \
    g++
# yaha tumhari repo ka API link
ADD https://api.github.com/repos/proboy315/ProBoy-MD/git/refs/heads/main version.json
# yaha tumhari repo ka clone
RUN git clone -b main https://github.com/proboy315/ProBoy-MD /rgnk
WORKDIR /rgnk
RUN mkdir -p temp
ENV TZ=Asia/Kolkata
RUN npm install -g --force yarn pm2
RUN yarn install
CMD ["npm", "start"]