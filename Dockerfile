# --- Build Stage ---
# 使用一個包含 Node.js 的映像檔來建置您的 React 應用程式
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN npm install
COPY . .
# 執行建置命令，產生靜態檔案
RUN npm run build

# --- Production Stage ---
# 使用一個輕量級的網頁伺服器 (如 Nginx) 來託管建置好的靜態檔案
FROM nginx:1.25-alpine
# 將建置階段產生的靜態檔案複製到 Nginx 的預設網站目錄
COPY --from=build /app/build /usr/share/nginx/html
# 暴露 80 連接埠
EXPOSE 80
# 啟動 Nginx 伺服器
CMD ["nginx", "-g", "daemon off;"]
