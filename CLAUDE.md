# CLAUDE.md

本文件为 Claude Code (claude.ai/claude-code) 在此代码仓库中工作时提供指导。

## 项目概述

即梦 AI 免费 API 服务 - 逆向工程的 API 服务器，提供 OpenAI 兼容接口，封装即梦 AI 的图像和视频生成能力。

**版本：** v0.8.5

**核心功能：**
- 文生图：支持 jimeng-5.0-preview、jimeng-4.6、jimeng-4.5 等多款模型，最高 4K 分辨率
- 图生图：多图合成，支持 1-10 张输入图片
- 视频生成：jimeng-video-3.5-pro 等模型，支持首帧/尾帧控制
- Seedance 2.0：多模态智能视频生成，模型名 `jimeng-video-seedance-2.0`（兼容 `seedance-2.0`），支持图片/视频/音频混合上传，@1、@2 占位符引用素材，4-15 秒时长
- OpenAI 兼容：完全兼容 OpenAI API 格式，无缝对接现有客户端
- 多账号支持：支持多个 sessionid 轮询使用

## 构建和开发命令

```bash
# 安装依赖
npm install

# 安装 Chromium 浏览器（Seedance 模型需要）
npx playwright-core install chromium --with-deps

# 开发模式（热重载）
npm run dev

# 生产环境构建
npm run build

# 启动生产服务
npm start
```

## Docker 命令

```bash
# 构建 Docker 镜像
docker build -t jimeng-free-api-all:latest .

# 运行容器
docker run -it -d --init --name jimeng-free-api-all -p 8000:8000 -e TZ=Asia/Shanghai jimeng-free-api-all:latest

# 使用 Docker Hub 预构建镜像
docker pull wwwzhouhui569/jimeng-free-api-all:latest
docker run -it -d --init --name jimeng-free-api-all -p 8000:8000 -e TZ=Asia/Shanghai wwwzhouhui569/jimeng-free-api-all:latest
```

## 项目架构

```
src/
├── index.ts                    # 应用入口
├── daemon.ts                   # 守护进程管理
├── api/
│   ├── controllers/            # 业务逻辑控制器
│   │   ├── core.ts            # 核心工具（Token处理、积分管理、请求封装）
│   │   ├── images.ts          # 图像生成逻辑（文生图、图生图）
│   │   ├── videos.ts          # 视频生成逻辑（含 Seedance 2.0）
│   │   └── chat.ts            # 对话补全逻辑
│   ├── routes/                 # API 路由定义
│   │   ├── index.ts           # 路由聚合器
│   │   ├── images.ts          # /v1/images/* 端点
│   │   ├── videos.ts          # /v1/videos/* 端点
│   │   ├── video.ts           # /v1/video/* 端点（videos 的包装路由）
│   │   ├── chat.ts            # /v1/chat/* 端点
│   │   ├── models.ts          # /v1/models 端点
│   │   ├── ping.ts            # /ping 健康检查端点
│   │   └── token.ts           # /token/* Token管理端点
│   └── consts/
│       └── exceptions.ts       # API 异常定义
└── lib/
    ├── server.ts              # Koa 服务器配置（含中间件栈）
    ├── browser-service.ts     # 浏览器代理服务（Seedance shark 反爬绕过）
    ├── config.ts              # 配置管理
    ├── logger.ts              # 日志工具
    ├── util.ts                # 辅助工具函数
    ├── environment.ts         # 环境变量
    ├── initialize.ts          # 初始化逻辑
    ├── http-status-codes.ts   # HTTP 状态码
    ├── request/
    │   └── Request.ts         # 请求解析与验证（含文件上传规范化）
    ├── response/
    │   ├── Response.ts        # 响应包装器
    │   ├── Body.ts            # 响应体
    │   └── FailureBody.ts     # 错误响应体
    ├── exceptions/
    │   ├── Exception.ts       # 基础异常类
    │   └── APIException.ts    # API 异常类
    ├── interfaces/
    │   └── ICompletionMessage.ts  # 对话消息接口
    └── configs/               # 配置模式
        ├── model-config.ts    # 模型配置（模型参数、分辨率映射等）
        ├── service-config.ts  # 服务配置
        └── system-config.ts   # 系统配置
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | OpenAI 兼容的对话接口（用于图像/视频生成） |
| `/v1/images/generations` | POST | 文生图/图生图接口（支持 images 可选参数） |
| `/v1/images/compositions` | POST | 图生图接口（支持文件上传，向后兼容） |
| `/v1/videos/generations` | POST | 视频生成接口（含 Seedance 2.0 / 2.0-fast） |
| `/v1/video/generations` | POST | 视频生成接口（别名路由） |
| `/v1/models` | GET | 获取可用模型列表 |
| `/token/check` | POST | 检查 Token 有效性 |
| `/token/points` | POST | 查询账户积分 |
| `/ping` | GET | 健康检查端点 |

## 关键技术细节

### 认证方式
- 使用即梦网站的 `sessionid` Cookie 作为 Bearer Token
- 多账号支持：逗号分隔多个 sessionid：`Authorization: Bearer sessionid1,sessionid2`
- 每次请求随机选择一个 sessionid 使用

### 模型映射

#### 图像模型
| 用户模型名 | 内部模型名 | Draft 版本 | 说明 |
|-----------|-----------|-----------|------|
| `jimeng-5.0-preview` | `high_aes_general_v50` | 3.3.9 | 5.0 预览版，最新模型 |
| `jimeng-4.6` | `high_aes_general_v42` | 3.3.9 | 推荐使用 |
| `jimeng-4.5` | `high_aes_general_v40l` | 3.3.4 | 高质量模型 |
| `jimeng-4.1` | `high_aes_general_v41` | 3.3.4 | 高质量模型 |
| `jimeng-4.0` | `high_aes_general_v40` | 3.3.4 | 稳定版本 |
| `jimeng-3.1` | `high_aes_general_v30l_art_fangzhou` | - | 艺术风格 |
| `jimeng-3.0` | `high_aes_general_v30l` | - | 通用模型 |
| `jimeng-2.1` | - | - | 旧版模型 |
| `jimeng-2.0-pro` | - | - | 旧版专业模型 |
| `jimeng-2.0` | - | - | 旧版模型 |
| `jimeng-1.4` | - | - | 早期模型 |
| `jimeng-xl-pro` | - | - | XL 专业模型 |

#### 视频模型
| 用户模型名 | 内部模型名 | 说明 |
|-----------|-----------|------|
| `jimeng-video-3.5-pro` | `dreamina_ic_generate_video_model_vgfm_3.5_pro` | 最新视频模型 |
| `jimeng-video-3.0` | - | 视频生成 3.0 |
| `jimeng-video-3.0-pro` | - | 视频生成 3.0 专业版 |
| `jimeng-video-2.0` | - | 视频生成 2.0 |
| `jimeng-video-2.0-pro` | - | 视频生成 2.0 专业版 |
| `jimeng-video-seedance-2.0` | `dreamina_seedance_40_pro` | Seedance 2.0（上游标准名称，推荐） |
| `seedance-2.0` | `dreamina_seedance_40_pro` | 多图智能视频生成（向后兼容别名） |
| `seedance-2.0-pro` | `dreamina_seedance_40_pro` | 多图智能视频生成专业版（向后兼容别名） |
| `jimeng-video-seedance-2.0-fast` | `dreamina_seedance_40` | Seedance 2.0-fast 快速版（上游标准名称） |
| `seedance-2.0-fast` | `dreamina_seedance_40` | Seedance 2.0-fast 快速版（向后兼容别名） |

### 请求参数

#### 图像生成参数 (`/v1/images/generations`)
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 否 | jimeng-4.5 | 模型名称 |
| prompt | string | 是 | - | 提示词，jimeng-4.x/5.x 支持多图生成 |
| images | array | 否 | - | 图片URL数组（1-10张），提供则走图生图模式，不提供则走文生图模式 |
| negative_prompt | string | 否 | "" | 反向提示词 |
| ratio | string | 否 | 1:1 | 宽高比：1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9 |
| resolution | string | 否 | 2k | 分辨率：1k, 2k, 4k |
| sample_strength | float | 否 | 0.5 | 精细度 0.0-1.0 |
| response_format | string | 否 | url | url 或 b64_json |

**说明：**
- 当 `images` 参数为空或不提供时，接口执行文生图功能
- 当 `images` 参数提供（1-10张图片）时，接口执行图生图功能
- 支持 `application/json`（images 为 URL 数组）和 `multipart/form-data`（通过 images 字段上传文件）两种请求格式
- 图生图模式下，响应会额外包含 `input_images` 和 `composition_type` 字段

#### 图生图参数 (`/v1/images/compositions`) - 向后兼容
- 与 `/v1/images/generations` 相同的参数
- `images` 字段为必填（1-10张图片）
- 额外支持 multipart/form-data 文件上传

#### 视频生成参数 (`/v1/videos/generations`)
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 否 | jimeng-video-3.0 | 模型名称 |
| prompt | string | 否 | - | 视频描述（图生视频时可选） |
| ratio | string | 否 | 1:1 | 宽高比：1:1, 4:3, 3:4, 16:9, 9:16 |
| resolution | string | 否 | 720p | 分辨率：480p, 720p, 1080p |
| duration | number | 否 | 5 | 时长：4-15秒（Seedance）、5 或 10 秒（普通） |
| file_paths / filePaths | array | 否 | [] | 首帧/尾帧图片 URL |
| files | file[] | 否 | - | 上传的素材文件（图片/视频/音频，multipart） |

#### Seedance 2.0 / 2.0-fast 专用参数
- 使用 `unified_edit_input` 结构，包含 `material_list` 和 `meta_list`
- 支持多模态素材混合上传：图片（ImageX）、视频/音频（VOD）
- 素材类型自动检测：通过 MIME 类型或文件扩展名判断（image/video/audio）
- 上游标准模型名：`jimeng-video-seedance-2.0`（兼容 `seedance-2.0`、`seedance-2.0-pro`）
- 快速版模型名：`jimeng-video-seedance-2.0-fast`（兼容 `seedance-2.0-fast`）
- 内部模型（标准版）：`dreamina_seedance_40_pro`，benefit_type：`dreamina_video_seedance_20_pro`
- 内部模型（快速版）：`dreamina_seedance_40`，benefit_type：`dreamina_seedance_20_fast`（注意：无 `video_` 前缀）
- Draft 版本：3.3.9
- 时长范围：4-15 秒（连续范围，与上游 iptag/jimeng-api 一致）
- 提示词占位符：`@1`、`@2`、`@图1`、`@图2`、`@image1`、`@image2` 引用上传的素材
- 支持的素材格式：图片（jpg/png/webp/gif/bmp）、视频（mp4/mov/m4v）、音频（mp3/wav）

### Shark 反爬与浏览器代理（v0.8.4）
- 即梦对 Seedance 的 `/mweb/v1/aigc_draft/generate` 接口启用了 shark 安全中间件，要求请求携带 `a_bogus` 签名
- `a_bogus` 由字节跳动 `bdms` SDK 在浏览器中生成，依赖真实浏览器环境（Canvas, WebGL, DOM），Node.js 无法直接运行
- 解决方案：通过 `BrowserService`（`src/lib/browser-service.ts`）使用 Playwright 启动 headless Chromium，`bdms` SDK 自动拦截 `fetch` 并注入 `a_bogus`
- 仅 Seedance 的 generate 请求走浏览器代理，其他请求继续用 Node.js `axios`
- 浏览器懒启动，首次 Seedance 请求时创建；每个 sessionId 独立会话；10 分钟空闲自动清理
- 资源拦截：屏蔽图片/字体/CSS，仅允许 bdms SDK 相关脚本（白名单域名：`vlabstatic.com`、`bytescm.com`、`jianying.com`、`byteimg.com`）

### 文件上传
- 支持 multipart/form-data 文件上传
- koa-body 配置最大文件大小 100MB
- files 字段可以是对象或数组格式（在 Request.ts 中自动规范化）
- 支持 formLimit/jsonLimit/textLimit：100mb

### 上传通道（v0.8.5）
- **ImageX 通道**（图片上传）：`get_upload_token(scene=2)` → `imagex.bytedanceapi.com` → `ApplyImageUpload` / `CommitImageUpload`，返回 URI 格式 `tos-cn-i-{service_id}/{uuid}`，service_id 为 `tb4s082cfz`
- **VOD 通道**（视频/音频上传）：`get_upload_token(scene=1)` → `vod.bytedanceapi.com` → `ApplyUploadInner` / `CommitUploadInner`，返回 vid 格式 `v028xxx`，SpaceName 为 `dreamina`
- AWS Signature V4 签名：ImageX 使用 service=`imagex`，VOD 使用 service=`vod`，region 均为 `cn-north-1`
- VOD 上传自动返回媒体元数据（Duration、Width、Height、Fps 等），音频时长 fallback 使用本地 WAV 头解析

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

### 服务器中间件栈
1. **CORS 跨域支持**：`koa2-cors()`
2. **Range 请求**：`koaRange`（支持分段内容传输）
3. **自定义异常处理器**：捕获错误并返回 FailureBody 响应
4. **自定义 JSON 解析器**：处理 POST/PUT/PATCH 请求的 JSON（清理问题 Unicode 字符，跳过 multipart 请求）
5. **Body 解析器**：`koa-body`（multipart: true，maxFileSize: 100MB）

## 开发规范

1. **TypeScript**：项目使用 TypeScript + ESM 模块
2. **路径别名**：使用 `@/` 别名指向 `src/` 目录
3. **日志**：使用 `@/lib/logger.ts` 中的 logger 保持输出一致
4. **配置**：环境配置在 `configs/` 目录，通过 `@/lib/config.ts` 加载
5. **API 兼容性**：维护 OpenAI API 兼容性，确保客户端集成正常
6. **Node.js 版本**：≥16.0.0

## 测试 API 调用

```bash
# 文生图（使用最新模型）
curl -X POST http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_sessionid" \
  -d '{"model": "jimeng-5.0-preview", "prompt": "美丽的日落风景", "ratio": "16:9", "resolution": "2k"}'

# 图生图（通过 images 参数）
curl -X POST http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_sessionid" \
  -d '{"model": "jimeng-4.5", "prompt": "将两张图融合成梦幻风格", "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"], "ratio": "1:1", "resolution": "2k", "sample_strength": 0.5}'

# 图生图（multipart 文件上传）
curl -X POST http://localhost:8000/v1/images/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-4.5" \
  -F "prompt=将图片转换为油画风格" \
  -F "images=@/path/to/image1.jpg" \
  -F "ratio=1:1" \
  -F "resolution=2k"

# 视频生成
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_sessionid" \
  -d '{"model": "jimeng-video-3.5-pro", "prompt": "一只小猫在草地上玩耍", "ratio": "16:9", "resolution": "720p"}'

# Seedance 2.0 多图视频（文件上传）
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-video-seedance-2.0" \
  -F "prompt=@1 和 @2 两人开始跳舞" \
  -F "ratio=4:3" \
  -F "duration=4" \
  -F "files=@/path/to/image1.jpg" \
  -F "files=@/path/to/image2.jpg"

# Seedance 2.0-fast 快速多图视频
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-video-seedance-2.0-fast" \
  -F "prompt=@1 图片中的人物开始微笑" \
  -F "ratio=4:3" \
  -F "duration=5" \
  -F "files=@/path/to/image1.jpg"

# Seedance 图片+音频混合视频
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Authorization: Bearer your_sessionid" \
  -F "model=jimeng-video-seedance-2.0-fast" \
  -F "prompt=@1 图片中的人物随着音乐 @2 开始跳舞" \
  -F "ratio=9:16" \
  -F "duration=5" \
  -F "files=@/path/to/image.png" \
  -F "files=@/path/to/audio.wav"

# 健康检查
curl http://localhost:8000/ping

# Token 检查
curl -X POST http://localhost:8000/token/check \
  -H "Content-Type: application/json" \
  -d '{"token": "your_sessionid"}'
```

## 配置

默认端口：8000
配置文件在 `configs/` 目录，使用 YAML 格式。
