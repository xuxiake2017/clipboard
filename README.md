# 在线剪贴板

基于 Next.js、shadcn/ui 风格组件、Socket.IO 和 SQLite 的在线剪贴板。支持电脑和手机访问同一识别码房间，文字、图片和文件会实时同步。

## 启动

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## Docker 部署

先准备 `.env.local`，可从 `.env.example` 复制并填写腾讯 COS 配置。然后执行：

```bash
docker compose up -d --build
```

默认访问地址：

```text
http://localhost:3000
```

Compose 会把 SQLite 数据持久化到 `clipboard-data` 卷，把本地开发回退上传目录持久化到 `clipboard-uploads` 卷。Docker 部署时 `SQLITE_PATH` 会被 `docker-compose.yml` 覆盖为 `/app/data/clipboard.sqlite`，`.env.example` 里的相对路径只用于本地开发。生产环境建议配置腾讯 COS，文件下载流量会直接走对象存储。

反向代理示例：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## 功能

- 首页介绍在线剪贴板能力，并提供识别码输入框。
- 输入识别码和密码后自动查询或创建剪贴板，并跳转到 `/<识别码>`；刷新或分享该路径会保留识别码，重新输入密码即可进入。
- 首次创建剪贴板时会绑定密码，之后进入同一识别码需要校验相同密码。
- 多用户同时在线，消息通过 Socket.IO 实时更新。
- 进入后以对话框形式展示内容。
- 头像通过 DiceBear 生成；同一房间号和浏览器本地 clientId 会复用上次头像。
- 昵称为浏览器操作系统名称加最新用户 IP，IP 变化时只更新显示信息，不改变身份。
- 支持文字发送、文件选择发送、拖拽发送、Ctrl+V 粘贴图片或文件发送。
- SQLite 保存房间、用户身份和消息。
- 配置腾讯 COS 后上传到储存桶；未配置时本地开发回落到 `public/uploads`。
- COS 文件下载使用对象存储直链，并在上传时写入原始文件名响应头；本地开发文件才通过 `/api/download` 代理下载。

## 腾讯 COS 环境变量

复制 `.env.example` 为 `.env.local`，填写：

```bash
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_COS_BUCKET=
TENCENT_COS_REGION=
TENCENT_COS_PUBLIC_URL=
```

`TENCENT_COS_PUBLIC_URL` 可填写绑定 CDN 域名或储存桶公开访问域名。
