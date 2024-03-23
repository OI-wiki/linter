# 使用官方Node.js作为父镜像
FROM node:18

RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
# 设置工作目录
WORKDIR /usr/src/app

# 复制package.json和package-lock.json文件
COPY package*.json ./
COPY *.lock ./

# 安装应用依赖
RUN yarn install 

# 复制应用代码
COPY . .

# 暴露端口（根据您的应用需求来设置）
EXPOSE 3000

# 启动应用
CMD [ "node", "index.js" ]

