# Jimeng AI Free API

即梦 AI 免费 API 服务 - 支持文生图、图生图、视频生成的 OpenAI 兼容接口

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-v0.8.5-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

> 🎨 将即梦 AI 强大的图像和视频生成能力，通过 OpenAI 兼容接口开放给开发者

## 项目介绍

### 项目概述

Jimeng AI Free API 是一个逆向工程的 API 服务器，将即梦 AI（Jimeng AI）的图像和视频生成能力封装为 OpenAI 兼容的 API 接口。支持最新的 **jimeng-5.0-preview**、**jimeng-4.6** 文生图模型、**Seedance 2.0 多模态智能视频生成**（模型名 `jimeng-video-seedance-2.0`，支持图片/视频/音频混合上传）及 **Seedance 2.0-fast 快速版**（模型名 `jimeng-video-seedance-2.0-fast`），零配置部署，多路 token 支持。

### 核心功能

- 🖼️ **文生图**：支持 jimeng-5.0-preview、jimeng-4.6、jimeng-4.5 等多款模型，最高 4K 分辨率
- 🎭 **图生图**：多图合成，支持 1-10 张输入图片
- 🎬 **视频生成**：jimeng-video-3.5-pro 等模型，支持首帧/尾帧控制
- 🌊 **Seedance 2.0 / 2.0-fast**：多模态智能视频生成，支持图片/视频/音频混合上传，@1、@2 占位符引用素材，fast 版本生成更快
- 🔗 **OpenAI 兼容**：完全兼容 OpenAI API 格式，无缝对接现有客户端
- 🔄 **多账号支持**：支持多个 sessionid 轮询使用

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | >=16.0.0 | 运行环境 |
| TypeScript | ^5.0.0 | 开发语言 |
| Koa | ^2.15.0 | Web 框架 |
| Playwright | ^1.49.0 | 浏览器代理（Seedance 反爬绕过） |
| Docker | latest | 容器化部署 |

## 功能清单

| 功能名称 | 功能说明 | 模型 | 状态 |
|---------|---------|------|------|
| 文生图 | 根据文本描述生成图片 | jimeng-5.0-preview, jimeng-4.6, jimeng-4.5, jimeng-4.1 等 | ✅ 可用 |
| 图生图 | 多图合成生成新图片 | jimeng-5.0-preview, jimeng-4.6, jimeng-4.5 等 | ✅ 可用 |
| 文生视频 | 根据文本描述生成视频 | jimeng-video-3.5-pro 等 | ✅ 可用 |
| 图生视频 | 使用首帧/尾帧图片生成视频 | jimeng-video-3.0 等 | ✅ 可用 |
| 多图智能视频 | Seedance 2.0 多模态混合生成 | jimeng-video-seedance-2.0, seedance-2.0 | ✅ 可用 |
| 多图快速视频 | Seedance 2.0-fast 快速生成 | jimeng-video-seedance-2.0-fast, seedance-2.0-fast | ✅ 可用 |
| 音频驱动视频 | Seedance 图片+音频混合生成 | jimeng-video-seedance-2.0, seedance-2.0-fast | ✅ 可用 |
| Chat 接口 | OpenAI 兼容的对话接口 | 所有模型 | ✅ 可用 |

## 免责声明

> ⚠️ **重要提示**

**逆向 API 是不稳定的，建议前往即梦 AI 官方 https://jimeng.jianying.com/ 体验功能，避免封禁的风险。**

**本组织和个人不接受任何资金捐助和交易，此项目是纯粹研究交流学习性质！**

**仅限自用，禁止对外提供服务或商用，避免对官方造成服务压力，否则风险自担！**

## 安装说明

### 环境要求

- Node.js 16+
- npm 或 yarn
- Chromium 浏览器（Seedance 模型需要，通过 Playwright 自动管理）
- Docker（可选）

### 方式一：Docker 部署（推荐）

**使用 Docker Hub 镜像：**

```bash
# 拉取镜像
docker pull wwwzhouhui569/jimeng-free-api-all:latest

# 启动容器
docker run -it -d --init --name jimeng-free-api-all \
  -p 8000:8000 \
  -e TZ=Asia/Shanghai \
  wwwzhouhui569/jimeng-free-api-all:latest
```

**从源码构建：**

```bash
# 克隆项目
git clone https://github.com/wwwzhouhui/jimeng-free-api-all.git

# 进入目录
cd jimeng-free-api-all

# 构建镜像
docker build -t jimeng-free-api-all:latest .

# 启动容器
docker run -it -d --init --name jimeng-free-api-all \
  -p 8000:8000 \
  -e TZ=Asia/Shanghai \
  jimeng-free-api-all:latest
```

### 方式二：源码安装

```bash
# 克隆项目
git clone https://github.com/wwwzhouhui/jimeng-free-api-all.git

# 进入目录
cd jimeng-free-api-all

# 安装依赖
npm install

# 安装 Chromium 浏览器（Seedance 模型需要）
npx playwright-core install chromium --with-deps

# 开发模式
npm run dev

# 生产模式
npm run build && npm start
```

## 使用说明

### 获取 SessionID

1. 访问 [即梦 AI](https://jimeng.jianying.com/) 并登录账号
2. 按 F12 打开开发者工具
3. 进入 Application > Cookies
4. 找到 `sessionid` 的值

![获取 sessionid](./doc/example-0.png)

### 多账号配置

支持多个账号的 sessionid，使用逗号分隔：

```
Authorization: Bearer sessionid1,sessionid2,sessionid3
```

每次请求会从中随机选择一个使用。

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | OpenAI 兼容的对话接口 |
| `/v1/images/generations` | POST | 文生图/图生图接口（支持 images 可选参数） |
| `/v1/images/compositions` | POST | 图生图接口（向后兼容） |
| `/v1/videos/generations` | POST | 视频生成接口 |
| `/v1/models` | GET | 获取模型列表 |

### 快速开始

**文生图示例：**

```bash
curl -X POST http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_sessionid" \
  -d '{
    "model": "jimeng-4.5",
    "prompt": "美丽的日落风景，湖边的小屋",
    "ratio": "16:9",
    "resolution": "2k"
  }'
```

**图生图示例（通过 images 参数）：**

```bash
curl -X POST http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_sessionid" \
  -d '{
    "model": "jimeng-4.5",
    "prompt": "将两张图融合成梦幻风格",
    "images": [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg"
    ],
    "ratio": "1:1",
    "resolution": "2k",
    "sample_strength": 0.5
  }'
```

**视频生成示例：**

```bash
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_sessionid" \
  -d '{
    "model": "jimeng-video-3.5-pro",
    "prompt": "一只可爱的小猫在草地上玩耍",
    "ratio": "16:9",
    "resolution": "720p",
    "duration": 5
  }'
```

**Seedance 2.0 多图视频示例：**

```bash
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-video-seedance-2.0" \
  -F "prompt=@1 和 @2 两人开始跳舞" \
  -F "ratio=4:3" \
  -F "duration=4" \
  -F "files=@/path/to/image1.jpg" \
  -F "files=@/path/to/image2.jpg"
```

**Seedance 2.0-fast 快速视频示例：**

```bash
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-video-seedance-2.0-fast" \
  -F "prompt=@1 图片中的人物开始微笑" \
  -F "ratio=4:3" \
  -F "duration=5" \
  -F "files=@/path/to/image1.jpg"
```

**Seedance 图片+音频混合示例：**

```bash
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-video-seedance-2.0-fast" \
  -F "prompt=@1 图片中的人物随着音乐 @2 开始跳舞" \
  -F "ratio=9:16" \
  -F "duration=5" \
  -F "files=@/path/to/image.png" \
  -F "files=@/path/to/audio.wav"
```

## 项目结构

```
jimeng-free-api-all/
├── src/
│   ├── index.ts                 # 应用入口
│   ├── daemon.ts                # 守护进程管理
│   ├── api/
│   │   ├── controllers/         # 业务逻辑控制器
│   │   │   ├── core.ts          # 核心工具（Token处理等）
│   │   │   ├── images.ts        # 图像生成逻辑
│   │   │   ├── videos.ts        # 视频生成逻辑
│   │   │   └── chat.ts          # 对话补全逻辑
│   │   ├── routes/              # API 路由定义
│   │   │   ├── index.ts         # 路由聚合
│   │   │   ├── images.ts        # /v1/images/* 端点
│   │   │   ├── videos.ts        # /v1/videos/* 端点
│   │   │   ├── chat.ts          # /v1/chat/* 端点
│   │   │   └── models.ts        # /v1/models 端点
│   │   └── consts/              # API 常量和异常
│   └── lib/
│       ├── server.ts            # Koa 服务器配置
│       ├── browser-service.ts   # 浏览器代理服务（Seedance 反爬）
│       ├── config.ts            # 配置管理
│       ├── logger.ts            # 日志工具
│       ├── util.ts              # 辅助工具
│       ├── request/             # 请求处理类
│       ├── response/            # 响应处理类
│       ├── exceptions/          # 异常类
│       └── configs/             # 配置模式
├── configs/                     # 配置文件目录
├── doc/                         # 文档资源
├── Dockerfile                   # Docker 构建文件
├── package.json                 # 项目配置
└── tsconfig.json                # TypeScript 配置
```

## 模型说明

### 文生图模型

| 用户模型名 | 内部模型名 | 说明 |
|-----------|-----------|------|
| `jimeng-5.0-preview` | `high_aes_general_v50` | 5.0 预览版，最新模型 |
| `jimeng-4.6` | `high_aes_general_v42` | 最新模型，推荐使用 |
| `jimeng-4.5` | `high_aes_general_v40l` | 高质量模型 |
| `jimeng-4.1` | `high_aes_general_v41` | 高质量模型 |
| `jimeng-4.0` | `high_aes_general_v40` | 稳定版本 |
| `jimeng-3.1` | `high_aes_general_v30l_art_fangzhou` | 艺术风格 |
| `jimeng-3.0` | `high_aes_general_v30l` | 通用模型 |
| `jimeng-2.1` | - | 旧版模型 |
| `jimeng-2.0-pro` | - | 旧版专业模型 |
| `jimeng-2.0` | - | 旧版模型 |
| `jimeng-1.4` | - | 早期模型 |
| `jimeng-xl-pro` | - | XL 专业模型 |

### 视频模型

| 用户模型名 | 内部模型名 | 说明 |
|-----------|-----------|------|
| `jimeng-video-3.5-pro` | `dreamina_ic_generate_video_model_vgfm_3.5_pro` | 最新视频模型 |
| `jimeng-video-3.0` | - | 视频生成 3.0 |
| `jimeng-video-3.0-pro` | - | 视频生成 3.0 专业版 |
| `jimeng-video-2.0` | - | 视频生成 2.0 |
| `jimeng-video-2.0-pro` | - | 视频生成 2.0 专业版 |
| `jimeng-video-seedance-2.0` | `dreamina_seedance_40_pro` | Seedance 2.0（上游标准名称，推荐） |
| `seedance-2.0` | `dreamina_seedance_40_pro` | Seedance 2.0（向后兼容别名） |
| `seedance-2.0-pro` | `dreamina_seedance_40_pro` | Seedance 2.0（向后兼容别名） |
| `jimeng-video-seedance-2.0-fast` | `dreamina_seedance_40` | Seedance 2.0-fast 快速版（上游标准名称） |
| `seedance-2.0-fast` | `dreamina_seedance_40` | Seedance 2.0-fast 快速版（向后兼容别名） |

### 分辨率支持

#### 图片分辨率

| 分辨率 | 1:1 | 4:3 | 3:4 | 16:9 | 9:16 | 3:2 | 2:3 | 21:9 |
|--------|-----|-----|-----|------|------|-----|-----|------|
| 1k | 1024×1024 | 768×1024 | 1024×768 | 1024×576 | 576×1024 | 1024×682 | 682×1024 | 1195×512 |
| 2k | 2048×2048 | 2304×1728 | 1728×2304 | 2560×1440 | 1440×2560 | 2496×1664 | 1664×2496 | 3024×1296 |
| 4k | 4096×4096 | 4608×3456 | 3456×4608 | 5120×2880 | 2880×5120 | 4992×3328 | 3328×4992 | 6048×2592 |

#### 视频分辨率

| 分辨率 | 1:1 | 4:3 | 3:4 | 16:9 | 9:16 |
|--------|-----|-----|-----|------|------|
| 480p | 480×480 | 640×480 | 480×640 | 854×480 | 480×854 |
| 720p | 720×720 | 960×720 | 720×960 | 1280×720 | 720×1280 |
| 1080p | 1080×1080 | 1440×1080 | 1080×1440 | 1920×1080 | 1080×1920 |

## API 详细文档

### 图像生成接口

**POST /v1/images/generations**

统一接口，支持文生图和图生图两种模式：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 否 | jimeng-4.5 | 模型名称 |
| prompt | string | 是 | - | 提示词，支持多图生成 |
| images | array | 否 | - | 图片URL数组（1-10张），提供则走图生图模式，不提供则走文生图模式 |
| negative_prompt | string | 否 | "" | 反向提示词 |
| ratio | string | 否 | 1:1 | 宽高比 |
| resolution | string | 否 | 2k | 分辨率：1k, 2k, 4k |
| sample_strength | number | 否 | 0.5 | 精细度 0-1 |
| response_format | string | 否 | url | url 或 b64_json |

**说明：**
- 当 `images` 参数为空或不提供时，接口执行文生图功能
- 当 `images` 参数提供（1-10张图片）时，接口执行图生图功能
- 支持 `application/json`（images 为 URL 数组）和 `multipart/form-data`（通过 images 字段上传文件）两种请求格式
- 图生图模式下，响应会额外包含 `input_images` 和 `composition_type` 字段

### 图生图接口（向后兼容）

**POST /v1/images/compositions**

保留此接口以确保向后兼容，功能与 `/v1/images/generations` 提供 `images` 参数时相同。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 否 | jimeng-4.5 | 模型名称 |
| prompt | string | 是 | - | 提示词 |
| images | array | 是 | - | 图片URL数组，1-10张 |
| ratio | string | 否 | 1:1 | 宽高比 |
| resolution | string | 否 | 2k | 分辨率 |

### 视频生成接口

**POST /v1/videos/generations**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 否 | jimeng-video-3.0 | 模型名称 |
| prompt | string | 是 | - | 视频描述 |
| ratio | string | 否 | 1:1 | 宽高比 |
| resolution | string | 否 | 720p | 分辨率：480p, 720p, 1080p |
| duration | number | 否 | 5 | 时长：4-15 秒（Seedance）、5 或 10 秒（普通） |
| file_paths | array | 否 | [] | 首帧/尾帧图片URL |

### Seedance 2.0 / 2.0-fast 接口

**POST /v1/videos/generations**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 是 | - | jimeng-video-seedance-2.0（推荐）、jimeng-video-seedance-2.0-fast（快速版）或 seedance-2.0 |
| prompt | string | 否 | - | 提示词，使用 @1、@2 引用素材（图片/视频/音频） |
| ratio | string | 否 | 4:3 | 宽高比 |
| duration | number | 否 | 4 | 视频时长 4-15 秒 |
| files | file[] | 是* | - | 上传的素材文件（图片/视频/音频，multipart） |
| file_paths | array | 是* | - | 素材URL数组（JSON） |

**支持的素材类型：**
- 图片：jpg, png, webp, gif, bmp
- 视频：mp4, mov, m4v
- 音频：mp3, wav

**提示词占位符：**
- `@1` / `@图1` / `@image1` - 引用第一个素材
- `@2` / `@图2` / `@image2` - 引用第二个素材

## 效果展示

![image-20260209234137309](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260209234137309.png)

![image-20260209230221386](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260209230221386.png)

![多图合成](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/QQ_1757688787070.png)

![文生视频 3.0](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/QQ_1757688755495.png)

![文生视频 3.5](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20251220192531051.png)

## 开发指南

### 本地开发

```bash
# 克隆项目
git clone https://github.com/wwwzhouhui/jimeng-free-api-all.git
cd jimeng-free-api-all

# 安装依赖
npm install

# 安装 Chromium 浏览器（首次开发需要）
npx playwright-core install chromium --with-deps

# 开发模式（热重载）
npm run dev
```

### 构建部署

```bash
# 构建生产版本
npm run build

# 启动生产服务
npm start
```

### 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 常见问题

<details>
<summary>如何获取 sessionid？</summary>

1. 访问 [即梦 AI](https://jimeng.jianying.com/) 并登录
2. 按 F12 打开开发者工具
3. 进入 Application > Cookies
4. 复制 `sessionid` 的值

</details>

<details>
<summary>sessionid 失效怎么办？</summary>

sessionid 有效期有限，失效后需要重新登录即梦网站获取新的 sessionid。建议配置多个账号以提高可用性。

</details>

<details>
<summary>如何配置多账号？</summary>

在 Authorization 头中使用逗号分隔多个 sessionid：
```
Authorization: Bearer sessionid1,sessionid2,sessionid3
```

</details>

<details>
<summary>Docker 容器无法启动？</summary>

1. 检查端口 8000 是否被占用
2. 确保 Docker 服务正在运行
3. 查看容器日志：`docker logs jimeng-free-api-all`

</details>

<details>
<summary>生成失败返回错误？</summary>

1. 检查 sessionid 是否有效
2. 确认账号积分是否充足
3. 检查请求参数是否正确
4. 查看服务器日志获取详细错误信息

</details>

<details>
<summary>Seedance 视频生成报 "shark not pass" 错误？</summary>

该错误表示即梦的 shark 安全中间件拦截了请求。v0.8.4 已通过 Playwright 浏览器代理解决此问题。请确保：

1. 已安装 Chromium 浏览器：`npx playwright-core install chromium --with-deps`
2. Docker 用户请使用 v0.8.4 及以上版本的镜像，Dockerfile 已内置 Chromium 支持
3. 首次 Seedance 请求会自动启动浏览器（约数秒），后续请求复用会话

</details>

## 更新日志

### v0.8.5 (2026-02-20) - Seedance 多模态素材支持（图片/视频/音频混合上传）

- ✨ **Seedance 多模态素材上传**：支持图片、视频、音频混合上传，通过 MIME 类型和文件扩展名自动检测素材类型
- ✨ **VOD 上传通道**：音频/视频文件通过 ByteDance VOD API 上传（`ApplyUploadInner` → Upload → `CommitUploadInner`），获取真实 VOD vid
- ✨ **音频时长解析**：VOD 服务自动解析音频时长，兜底支持 WAV 文件头解析
- 🔧 **AWS 签名增强**：`createSignature` 支持自定义 `region` 和 `service` 参数，支持 ImageX（`imagex`）和 VOD（`vod`）双通道签名
- 🔧 **上传令牌分离**：图片上传使用 `scene: 2`（ImageX），音频/视频上传使用 `scene: 1`（VOD，`spaceName=dreamina`）
- 📝 **支持的素材格式**：图片（jpg/png/webp/gif/bmp）、视频（mp4/mov/m4v）、音频（mp3/wav）

### v0.8.4 (2026-02-18) - 修复 Seedance "shark not pass" 反爬拦截

- 🐛 **修复 Seedance 视频生成被 shark 安全中间件拦截**：即梦对 `/mweb/v1/aigc_draft/generate` 接口新增 `a_bogus` 签名校验，Node.js 直接请求返回 `ret=1019, "shark not pass"`
- ✨ **新增 BrowserService 浏览器代理服务**：通过 Playwright 启动 headless Chromium，利用字节跳动 `bdms` SDK 在浏览器中自动注入 `a_bogus` 签名
- 🔧 **仅 Seedance generate 请求走浏览器代理**：其他请求（图片生成、普通视频、上传、轮询、积分查询）不受影响，继续用 Node.js 直接请求
- ⚡ **懒启动与会话复用**：首次 Seedance 请求才启动浏览器，每个 sessionId 独立会话，10 分钟空闲自动清理
- 🔧 **资源优化**：浏览器屏蔽图片/字体/CSS 等无关资源，仅加载 bdms SDK 相关脚本（白名单域名：vlabstatic.com、bytescm.com、jianying.com）
- 🐳 **Docker 支持更新**：Dockerfile 改用 `node:lts`（非 alpine），内置 Chromium 系统依赖和浏览器安装
- 📦 **新增依赖**：`playwright-core ^1.49.0`

### v0.8.3 (2026-02-14) - 修复 Seedance 2.0-fast 积分扣减失败

- 🐛 **修复 fast 版 benefit_type 错误**：`dreamina_video_seedance_20_fast` → `dreamina_seedance_20_fast`（无 `video_` 前缀），解决 `credit prededuct failed` 错误
- 🔧 **升级 Seedance Draft 版本**：`3.3.8` → `3.3.9`，与即梦官网保持一致
- 🔧 **升级客户端版本号**：`VERSION_CODE` 从 `5.8.0` → `8.4.0`，`Chrome UA` 更新至 132
- 🔧 **补全请求头**：新增 `App-Sdk-Version`、`Lan`、`Loc` 头部，匹配即梦官网请求
- 🔧 **修正 region 参数**：`CN` → `cn`（小写），与即梦官网一致
- 🔧 **补全 image_info.aigc_image 字段**：Seedance material_list 中的 image_info 新增 `aigc_image` 对象

### v0.8.2 (2026-02-13) - 新增 Seedance 2.0-fast 快速视频生成模型

- ✨ **新增 `jimeng-video-seedance-2.0-fast` 模型**：Seedance 2.0 快速版，内部模型为 `dreamina_seedance_40`，生成速度更快
- ✨ **新增 `seedance-2.0-fast` 别名**：向后兼容别名
- 🔧 **新增 fast 版 benefit_type**：`dreamina_video_seedance_20_fast`，区分标准版与快速版
- 🔧 **优化 Seedance 模型识别**：`isSeedanceModel` 函数改用前缀匹配，自动兼容后续新增的 Seedance 变体

### v0.8.1 (2026-02-10) - Seedance 2.0 模型名更新

- 🔄 **新增 `jimeng-video-seedance-2.0` 模型名**：原 `seedance-2.0`、`seedance-2.0-pro` 保留为向后兼容别名
- ⏱️ **扩展 Seedance 时长支持**：从固定 4 秒扩展为 4-15 秒连续范围
- 🔧 **更新 Draft 版本**：Seedance 模型 Draft 版本从 `3.3.9` 调整为 `3.3.8`

### v0.8.0 (2026-02-09) - 新增 jimeng-5.0-preview 和 jimeng-4.6 图像生成模型

- ✨ **新增 jimeng-5.0-preview 模型**：即梦 AI 最新 5.0 预览版图像生成模型（内部模型 `high_aes_general_v50`），支持文生图、图生图和多图生成
- ✨ **新增 jimeng-4.6 模型**：即梦 AI 4.6 版图像生成模型（内部模型 `high_aes_general_v42`），支持文生图、图生图和多图生成
- ⚡ **升级 Draft 版本**：jimeng-5.0-preview 和 jimeng-4.6 使用最新 `3.3.9` 版本
- 🔧 **扩展多图生成支持**：多图检测正则匹配扩展至 jimeng-5.x 系列模型

### v0.7.1 (2026-02-09) - 修复视频生成返回高清下载URL

- 🐛 **修复视频返回低码率预览URL的问题**：视频生成接口（含 Seedance 2.0）之前返回的是 `vlabvod.com` 低码率预览URL（bitrate ~1152），现在通过 `get_local_item_list` API 获取 `dreamnia.jimeng.com` 高码率下载URL（bitrate ~6297+）
- 🐛 **修复 Seedance 轮询响应解析失败**：`get_history_by_ids` API 返回数据以 historyId 为键（如 `result["8918159809292"]`），而非 `result.history_list` 数组，导致轮询循环无法正确解析响应，视频生成后客户端请求无返回
- 🐛 **修复普通视频轮询响应解析**：`generateVideo` 函数增加 `result[historyId]` 回退解析，兼容 historyId 键值格式的API响应
- 🐛 **修复 item_id 提取字段名**：API 返回的视频项目 ID 位于 `common_attr.id` 字段，补充该字段到提取链中

### v0.7.0 (2026-02-07) - Seedance 2.0 多图智能视频生成

- ✨ **新增 Seedance 2.0 模型**：支持多张图片混合生成视频
- ✨ **多图混合提示词**：支持 `@1`、`@2` 等占位符引用图片
- 🐛 **修复 multipart 文件上传**：优化 koa-body 配置
- 🔒 **安全漏洞修复**：升级依赖修复 19 个安全漏洞
- ⚡ **优化参数验证**：`prompt` 参数改为可选

### v0.6.0 (2024-12-20) - 新增视频模型

- ✨ **新增 jimeng-video-3.5-pro 模型**
- ⚡ **升级 Draft 版本**：使用 `3.3.4` 版本
- 🔧 **动态版本管理**：根据模型自动选择 draft 版本

### v0.5.0 (2024-12-12) - 参数格式优化

- 🔄 **统一参数格式**：使用 `ratio` 和 `resolution` 替代 `width`/`height`
- 📤 **支持 multipart/form-data**：图生图和视频生成支持直接上传文件
- ⚡ **优化错误提示**

### v0.4.0 (2024-12-11) - 免积分优化

- 🐛 **修复积分扣费问题**：优化请求参数实现免积分
- 🔧 **更新浏览器指纹**：Chrome 版本升级到 142

### v0.3.0 (2024-12-08)

- 🐛 **修复 jimeng-4.5 模型**：修正模型映射名称
- ⬆️ **升级版本号**：`DRAFT_VERSION` 升级到 `3.3.4`
- ✨ **扩展分辨率支持**：支持 1k/2k/4k 多种分辨率

## 技术交流群

欢迎加入技术交流群，分享使用心得：

![技术交流群](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260217095105519.png)

## 作者联系

- **微信**: laohaibao2025
- **邮箱**: 75271002@qq.com

![微信二维码](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Screenshot_20260123_095617_com.tencent.mm.jpg)

## 打赏

如果这个项目对你有帮助，欢迎请我喝杯咖啡 ☕

**微信支付**

![微信支付](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20250914152855543.png)

## 致谢

感谢以下项目的贡献：

- [jimeng-free-api-all](https://github.com/zhizinan1997/jimeng-free-api-all)
- [jimeng-free-api](https://github.com/LLM-Red-Team/jimeng-free-api)

## License

[MIT License](LICENSE)

## Star History

如果觉得项目不错，欢迎点个 Star ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=wwwzhouhui/jimeng-free-api-all&type=Date)](https://star-history.com/#wwwzhouhui/jimeng-free-api-all&Date)
