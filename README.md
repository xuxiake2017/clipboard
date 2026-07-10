# 在线剪贴板

基于 Next.js、shadcn/ui 风格组件、Socket.IO 和 SQLite 的在线剪贴板。支持电脑和手机访问同一识别码房间，文字、图片和文件会实时同步。

## 启动

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 功能

- 首页介绍在线剪贴板能力，并提供识别码输入框。
- 输入识别码后自动查询或创建剪贴板。
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
