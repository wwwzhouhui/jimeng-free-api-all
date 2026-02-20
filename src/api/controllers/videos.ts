import _ from "lodash";
import crypto from "crypto";
import fs from "fs";

import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import util from "@/lib/util.ts";
import { getCredit, receiveCredit, request, DEFAULT_ASSISTANT_ID as CORE_ASSISTANT_ID, WEB_ID, acquireToken } from "./core.ts";
import logger from "@/lib/logger.ts";
import browserService from "@/lib/browser-service.ts";

const DEFAULT_ASSISTANT_ID = 513695;
export const DEFAULT_MODEL = "jimeng-video-3.0";
const DEFAULT_DRAFT_VERSION = "3.2.8";

const MODEL_DRAFT_VERSIONS: { [key: string]: string } = {
  "jimeng-video-3.5-pro": "3.3.4",
  "jimeng-video-3.0-pro": "3.2.8",
  "jimeng-video-3.0": "3.2.8",
  "jimeng-video-2.0": "3.2.8",
  "jimeng-video-2.0-pro": "3.2.8",
  // Seedance 模型（与上游 iptag/jimeng-api 保持一致）
  "jimeng-video-seedance-2.0": "3.3.9",
  "seedance-2.0": "3.3.9",
  "seedance-2.0-pro": "3.3.9",
  // Seedance 2.0-fast 模型（v1.9.3 新增）
  "jimeng-video-seedance-2.0-fast": "3.3.9",
  "seedance-2.0-fast": "3.3.9",
};

const MODEL_MAP = {
  "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
  "jimeng-video-3.0-pro": "dreamina_ic_generate_video_model_vgfm_3.0_pro",
  "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0",
  "jimeng-video-2.0": "dreamina_ic_generate_video_model_vgfm_lite",
  "jimeng-video-2.0-pro": "dreamina_ic_generate_video_model_vgfm1.0",
  // Seedance 多图智能视频生成模型（jimeng-video-seedance-2.0 为上游标准名称）
  "jimeng-video-seedance-2.0": "dreamina_seedance_40_pro",
  "seedance-2.0": "dreamina_seedance_40_pro",
  "seedance-2.0-pro": "dreamina_seedance_40_pro",
  // Seedance 2.0-fast 快速生成模型（v1.9.3 新增，内部模型为 dreamina_seedance_40）
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_40",
  "seedance-2.0-fast": "dreamina_seedance_40",
};

// Seedance 模型的 benefit_type 映射
const SEEDANCE_BENEFIT_TYPE_MAP: { [key: string]: string } = {
  "jimeng-video-seedance-2.0": "dreamina_video_seedance_20_pro",
  "seedance-2.0": "dreamina_video_seedance_20_pro",
  "seedance-2.0-pro": "dreamina_video_seedance_20_pro",
  // Seedance 2.0-fast（v1.9.3 新增，注意：无 "video_" 前缀）
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_20_fast",
  "seedance-2.0-fast": "dreamina_seedance_20_fast",
};

// 判断是否为 Seedance 模型
export function isSeedanceModel(model: string): boolean {
  return model.startsWith("seedance-") || model.startsWith("jimeng-video-seedance-");
}

// ========== Seedance 多类型素材支持 ==========

// 素材类型
type SeedanceMaterialType = "image" | "video" | "audio";

// 上传结果统一接口
interface UploadedMaterial {
  type: SeedanceMaterialType;
  // 图片
  uri?: string;
  // 视频/音频（VOD）
  vid?: string;
  // 通用
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  name?: string;
}

// MIME 类型 → 素材类型映射
const MIME_TO_MATERIAL_TYPE: Record<string, SeedanceMaterialType> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image",
  "image/gif": "image", "image/bmp": "image",
  "video/mp4": "video", "video/quicktime": "video", "video/x-m4v": "video",
  "audio/mpeg": "audio", "audio/wav": "audio", "audio/x-wav": "audio",
  "audio/mp3": "audio",
};

// 扩展名 → 素材类型映射（兜底）
const EXT_TO_MATERIAL_TYPE: Record<string, SeedanceMaterialType> = {
  ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image",
  ".gif": "image", ".bmp": "image",
  ".mp4": "video", ".mov": "video", ".m4v": "video",
  ".mp3": "audio", ".wav": "audio",
};

// materialTypes 编码映射
const MATERIAL_TYPE_CODE: Record<SeedanceMaterialType, number> = {
  image: 1, video: 2, audio: 3,
};

/**
 * 检测上传文件的素材类型
 * 优先通过 MIME 类型判断，兜底通过文件扩展名
 */
function detectMaterialType(file: any): SeedanceMaterialType {
  // 优先通过 MIME 类型判断
  const mime = (file.mimetype || file.mimeType || "").toLowerCase();
  if (mime && MIME_TO_MATERIAL_TYPE[mime]) return MIME_TO_MATERIAL_TYPE[mime];
  // 兜底：通过文件扩展名判断
  const filename = (file.originalFilename || file.newFilename || "").toLowerCase();
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = filename.substring(dotIdx);
    if (EXT_TO_MATERIAL_TYPE[ext]) return EXT_TO_MATERIAL_TYPE[ext];
  }
  // 默认视为图片（向后兼容）
  return "image";
}

/**
 * 从 URL 检测素材类型
 * 通过 URL 路径的扩展名判断
 */
function detectMaterialTypeFromUrl(url: string): SeedanceMaterialType {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const dotIdx = pathname.lastIndexOf(".");
    if (dotIdx >= 0) {
      const ext = pathname.substring(dotIdx);
      if (EXT_TO_MATERIAL_TYPE[ext]) return EXT_TO_MATERIAL_TYPE[ext];
    }
  } catch {}
  // 默认视为图片（向后兼容）
  return "image";
}

// 视频支持的分辨率和比例配置
const VIDEO_RESOLUTION_OPTIONS: {
  [resolution: string]: {
    [ratio: string]: { width: number; height: number };
  };
} = {
  "480p": {
    "1:1": { width: 480, height: 480 },
    "4:3": { width: 640, height: 480 },
    "3:4": { width: 480, height: 640 },
    "16:9": { width: 854, height: 480 },
    "9:16": { width: 480, height: 854 },
  },
  "720p": {
    "1:1": { width: 720, height: 720 },
    "4:3": { width: 960, height: 720 },
    "3:4": { width: 720, height: 960 },
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
  },
  "1080p": {
    "1:1": { width: 1080, height: 1080 },
    "4:3": { width: 1440, height: 1080 },
    "3:4": { width: 1080, height: 1440 },
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
  },
};

// 解析视频分辨率参数
function resolveVideoResolution(
  resolution: string = "720p",
  ratio: string = "1:1"
): { width: number; height: number } {
  const resolutionGroup = VIDEO_RESOLUTION_OPTIONS[resolution];
  if (!resolutionGroup) {
    const supportedResolutions = Object.keys(VIDEO_RESOLUTION_OPTIONS).join(", ");
    throw new Error(`不支持的视频分辨率 "${resolution}"。支持的分辨率: ${supportedResolutions}`);
  }

  const ratioConfig = resolutionGroup[ratio];
  if (!ratioConfig) {
    const supportedRatios = Object.keys(resolutionGroup).join(", ");
    throw new Error(`在 "${resolution}" 分辨率下，不支持的比例 "${ratio}"。支持的比例: ${supportedRatios}`);
  }

  return {
    width: ratioConfig.width,
    height: ratioConfig.height,
  };
}

export function getModel(model: string) {
  return MODEL_MAP[model] || MODEL_MAP[DEFAULT_MODEL];
}

// AWS4-HMAC-SHA256 签名生成函数（从 images.ts 复制）
function createSignature(
  method: string,
  url: string,
  headers: { [key: string]: string },
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken?: string,
  payload: string = '',
  awsRegion: string = 'cn-north-1',
  serviceName: string = 'imagex'
) {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname || '/';
  const search = urlObj.search;

  // 创建规范请求
  const timestamp = headers['x-amz-date'];
  const date = timestamp.substr(0, 8);
  const region = awsRegion;
  const service = serviceName;
  
  // 规范化查询参数
  const queryParams: Array<[string, string]> = [];
  const searchParams = new URLSearchParams(search);
  searchParams.forEach((value, key) => {
    queryParams.push([key, value]);
  });
  
  // 按键名排序
  queryParams.sort(([a], [b]) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  
  const canonicalQueryString = queryParams
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // 规范化头部
  const headersToSign: { [key: string]: string } = {
    'x-amz-date': timestamp
  };
  
  if (sessionToken) {
    headersToSign['x-amz-security-token'] = sessionToken;
  }
  
  let payloadHash = crypto.createHash('sha256').update('').digest('hex');
  if (method.toUpperCase() === 'POST' && payload) {
    payloadHash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    headersToSign['x-amz-content-sha256'] = payloadHash;
  }
  
  const signedHeaders = Object.keys(headersToSign)
    .map(key => key.toLowerCase())
    .sort()
    .join(';');
  
  const canonicalHeaders = Object.keys(headersToSign)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(key => `${key.toLowerCase()}:${headersToSign[key].trim()}\n`)
    .join('');
  
  const canonicalRequest = [
    method.toUpperCase(),
    pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  // 创建待签名字符串
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');
  
  // 生成签名
  const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// 计算文件的CRC32值（从 images.ts 复制）
function calculateCRC32(buffer: ArrayBuffer): string {
  const crcTable = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    crcTable[i] = crc;
  }
  
  let crc = 0 ^ (-1);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
  }
  return ((crc ^ (-1)) >>> 0).toString(16).padStart(8, '0');
}

// 视频专用图片上传功能（基于 images.ts 的 uploadImageFromUrl）
async function uploadImageForVideo(imageUrl: string, refreshToken: string): Promise<string> {
  try {
    logger.info(`开始上传视频图片: ${imageUrl}`);
    
    // 第一步：获取上传令牌
    const tokenResult = await request("post", "/mweb/v1/get_upload_token", refreshToken, {
      data: {
        scene: 2, // AIGC 图片上传场景
      },
    });
    
    const { access_key_id, secret_access_key, session_token, service_id } = tokenResult;
    if (!access_key_id || !secret_access_key || !session_token) {
      throw new Error("获取上传令牌失败");
    }
    
    const actualServiceId = service_id || "tb4s082cfz";
    logger.info(`获取上传令牌成功: service_id=${actualServiceId}`);
    
    // 下载图片数据
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`下载图片失败: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const fileSize = imageBuffer.byteLength;
    const crc32 = calculateCRC32(imageBuffer);
    
    logger.info(`图片下载完成: 大小=${fileSize}字节, CRC32=${crc32}`);
    
    // 第二步：申请图片上传权限
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
    
    const randomStr = Math.random().toString(36).substring(2, 12);
    const applyUrl = `https://imagex.bytedanceapi.com/?Action=ApplyImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}&FileSize=${fileSize}&s=${randomStr}`;
    
    const requestHeaders = {
      'x-amz-date': timestamp,
      'x-amz-security-token': session_token
    };
    
    const authorization = createSignature('GET', applyUrl, requestHeaders, access_key_id, secret_access_key, session_token);
    
    logger.info(`申请上传权限: ${applyUrl}`);
    
    const applyResponse = await fetch(applyUrl, {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'authorization': authorization,
        'origin': 'https://jimeng.jianying.com',
        'referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
        'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'x-amz-date': timestamp,
        'x-amz-security-token': session_token,
      },
    });
    
    if (!applyResponse.ok) {
      const errorText = await applyResponse.text();
      throw new Error(`申请上传权限失败: ${applyResponse.status} - ${errorText}`);
    }
    
    const applyResult = await applyResponse.json();
    
    if (applyResult?.ResponseMetadata?.Error) {
      throw new Error(`申请上传权限失败: ${JSON.stringify(applyResult.ResponseMetadata.Error)}`);
    }
    
    logger.info(`申请上传权限成功`);
    
    // 解析上传信息
    const uploadAddress = applyResult?.Result?.UploadAddress;
    if (!uploadAddress || !uploadAddress.StoreInfos || !uploadAddress.UploadHosts) {
      throw new Error(`获取上传地址失败: ${JSON.stringify(applyResult)}`);
    }
    
    const storeInfo = uploadAddress.StoreInfos[0];
    const uploadHost = uploadAddress.UploadHosts[0];
    const auth = storeInfo.Auth;
    
    const uploadUrl = `https://${uploadHost}/upload/v1/${storeInfo.StoreUri}`;
    const imageId = storeInfo.StoreUri.split('/').pop();
    
    logger.info(`准备上传图片: imageId=${imageId}, uploadUrl=${uploadUrl}`);
    
    // 第三步：上传图片文件
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Authorization': auth,
        'Connection': 'keep-alive',
        'Content-CRC32': crc32,
        'Content-Disposition': 'attachment; filename="undefined"',
        'Content-Type': 'application/octet-stream',
        'Origin': 'https://jimeng.jianying.com',
        'Referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'X-Storage-U': '704135154117550',
      },
      body: imageBuffer,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`图片上传失败: ${uploadResponse.status} - ${errorText}`);
    }
    
    logger.info(`图片文件上传成功`);
    
    // 第四步：提交上传
    const commitUrl = `https://imagex.bytedanceapi.com/?Action=CommitImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}`;
    
    const commitTimestamp = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const commitPayload = JSON.stringify({
      SessionKey: uploadAddress.SessionKey,
      SuccessActionStatus: "200"
    });
    
    const payloadHash = crypto.createHash('sha256').update(commitPayload, 'utf8').digest('hex');
    
    const commitRequestHeaders = {
      'x-amz-date': commitTimestamp,
      'x-amz-security-token': session_token,
      'x-amz-content-sha256': payloadHash
    };
    
    const commitAuthorization = createSignature('POST', commitUrl, commitRequestHeaders, access_key_id, secret_access_key, session_token, commitPayload);
    
    const commitResponse = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'authorization': commitAuthorization,
        'content-type': 'application/json',
        'origin': 'https://jimeng.jianying.com',
        'referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
        'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'x-amz-date': commitTimestamp,
        'x-amz-security-token': session_token,
        'x-amz-content-sha256': payloadHash,
      },
      body: commitPayload,
    });
    
    if (!commitResponse.ok) {
      const errorText = await commitResponse.text();
      throw new Error(`提交上传失败: ${commitResponse.status} - ${errorText}`);
    }
    
    const commitResult = await commitResponse.json();
    
    if (commitResult?.ResponseMetadata?.Error) {
      throw new Error(`提交上传失败: ${JSON.stringify(commitResult.ResponseMetadata.Error)}`);
    }
    
    if (!commitResult?.Result?.Results || commitResult.Result.Results.length === 0) {
      throw new Error(`提交上传响应缺少结果: ${JSON.stringify(commitResult)}`);
    }
    
    const uploadResult = commitResult.Result.Results[0];
    if (uploadResult.UriStatus !== 2000) {
      throw new Error(`图片上传状态异常: UriStatus=${uploadResult.UriStatus}`);
    }
    
    const fullImageUri = uploadResult.Uri;
    
    // 验证图片信息
    const pluginResult = commitResult.Result?.PluginResult?.[0];
    if (pluginResult && pluginResult.ImageUri) {
      logger.info(`视频图片上传完成: ${pluginResult.ImageUri}`);
      return pluginResult.ImageUri;
    }

    logger.info(`视频图片上传完成: ${fullImageUri}`);
    return fullImageUri;

  } catch (error) {
    logger.error(`视频图片上传失败: ${error.message}`);
    throw error;
  }
}

// 从Buffer上传视频图片
async function uploadImageBufferForVideo(buffer: Buffer, refreshToken: string): Promise<string> {
  try {
    logger.info(`开始从Buffer上传视频图片，大小: ${buffer.length}字节`);

    // 第一步：获取上传令牌
    const tokenResult = await request("post", "/mweb/v1/get_upload_token", refreshToken, {
      data: {
        scene: 2,
      },
    });

    const { access_key_id, secret_access_key, session_token, service_id } = tokenResult;
    if (!access_key_id || !secret_access_key || !session_token) {
      throw new Error("获取上传令牌失败");
    }

    const actualServiceId = service_id || "tb4s082cfz";
    logger.info(`获取上传令牌成功: service_id=${actualServiceId}`);

    const fileSize = buffer.length;
    const crc32 = calculateCRC32(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

    logger.info(`Buffer大小: ${fileSize}字节, CRC32=${crc32}`);

    // 第二步：申请图片上传权限
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const randomStr = Math.random().toString(36).substring(2, 12);
    const applyUrl = `https://imagex.bytedanceapi.com/?Action=ApplyImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}&FileSize=${fileSize}&s=${randomStr}`;

    const requestHeaders = {
      'x-amz-date': timestamp,
      'x-amz-security-token': session_token
    };

    const authorization = createSignature('GET', applyUrl, requestHeaders, access_key_id, secret_access_key, session_token);

    const applyResponse = await fetch(applyUrl, {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'authorization': authorization,
        'origin': 'https://jimeng.jianying.com',
        'referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'x-amz-date': timestamp,
        'x-amz-security-token': session_token,
      },
    });

    if (!applyResponse.ok) {
      const errorText = await applyResponse.text();
      throw new Error(`申请上传权限失败: ${applyResponse.status} - ${errorText}`);
    }

    const applyResult = await applyResponse.json();

    if (applyResult?.ResponseMetadata?.Error) {
      throw new Error(`申请上传权限失败: ${JSON.stringify(applyResult.ResponseMetadata.Error)}`);
    }

    const uploadAddress = applyResult?.Result?.UploadAddress;
    if (!uploadAddress || !uploadAddress.StoreInfos || !uploadAddress.UploadHosts) {
      throw new Error(`获取上传地址失败: ${JSON.stringify(applyResult)}`);
    }

    const storeInfo = uploadAddress.StoreInfos[0];
    const uploadHost = uploadAddress.UploadHosts[0];
    const auth = storeInfo.Auth;

    const uploadUrl = `https://${uploadHost}/upload/v1/${storeInfo.StoreUri}`;

    // 第三步：上传图片文件
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Authorization': auth,
        'Content-CRC32': crc32,
        'Content-Disposition': 'attachment; filename="undefined"',
        'Content-Type': 'application/octet-stream',
        'Origin': 'https://jimeng.jianying.com',
        'Referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`图片上传失败: ${uploadResponse.status} - ${errorText}`);
    }

    logger.info(`Buffer图片文件上传成功`);

    // 第四步：提交上传
    const commitUrl = `https://imagex.bytedanceapi.com/?Action=CommitImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}`;

    const commitTimestamp = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const commitPayload = JSON.stringify({
      SessionKey: uploadAddress.SessionKey,
      SuccessActionStatus: "200"
    });

    const payloadHash = crypto.createHash('sha256').update(commitPayload, 'utf8').digest('hex');

    const commitRequestHeaders = {
      'x-amz-date': commitTimestamp,
      'x-amz-security-token': session_token,
      'x-amz-content-sha256': payloadHash
    };

    const commitAuthorization = createSignature('POST', commitUrl, commitRequestHeaders, access_key_id, secret_access_key, session_token, commitPayload);

    const commitResponse = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'authorization': commitAuthorization,
        'content-type': 'application/json',
        'origin': 'https://jimeng.jianying.com',
        'referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'x-amz-date': commitTimestamp,
        'x-amz-security-token': session_token,
        'x-amz-content-sha256': payloadHash,
      },
      body: commitPayload,
    });

    if (!commitResponse.ok) {
      const errorText = await commitResponse.text();
      throw new Error(`提交上传失败: ${commitResponse.status} - ${errorText}`);
    }

    const commitResult = await commitResponse.json();

    if (commitResult?.ResponseMetadata?.Error) {
      throw new Error(`提交上传失败: ${JSON.stringify(commitResult.ResponseMetadata.Error)}`);
    }

    if (!commitResult?.Result?.Results || commitResult.Result.Results.length === 0) {
      throw new Error(`提交上传响应缺少结果: ${JSON.stringify(commitResult)}`);
    }

    const uploadResult = commitResult.Result.Results[0];
    if (uploadResult.UriStatus !== 2000) {
      throw new Error(`图片上传状态异常: UriStatus=${uploadResult.UriStatus}`);
    }

    const fullImageUri = uploadResult.Uri;

    const pluginResult = commitResult.Result?.PluginResult?.[0];
    if (pluginResult && pluginResult.ImageUri) {
      logger.info(`Buffer视频图片上传完成: ${pluginResult.ImageUri}`);
      return pluginResult.ImageUri;
    }

    logger.info(`Buffer视频图片上传完成: ${fullImageUri}`);
    return fullImageUri;

  } catch (error) {
    logger.error(`Buffer视频图片上传失败: ${error.message}`);
    throw error;
  }
}

/**
 * 解析音频文件时长（毫秒）
 * 支持 WAV 格式精确解析，其他格式按 128kbps 估算
 */
function parseAudioDuration(buffer: Buffer): number {
  try {
    // WAV: RIFF header check
    if (buffer.length >= 44 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) {
      const byteRate = buffer.readUInt32LE(28);
      if (byteRate > 0) {
        // 查找 data chunk 获取精确大小
        let offset = 12;
        while (offset < buffer.length - 8) {
          const chunkId = buffer.toString('ascii', offset, offset + 4);
          const chunkSize = buffer.readUInt32LE(offset + 4);
          if (chunkId === 'data') {
            return Math.round(chunkSize / byteRate * 1000);
          }
          offset += 8 + chunkSize;
        }
        // 兜底：用文件大小估算
        return Math.round((buffer.length - 44) / byteRate * 1000);
      }
    }
    // 非 WAV：按 128kbps 估算
    return Math.round(buffer.length / (128 * 1000 / 8) * 1000);
  } catch {
    return 0;
  }
}

/**
 * 上传视频/音频文件
 * 通过 ByteDance VOD (视频点播) API 上传
 * 流程: get_upload_token(scene=1) → ApplyUploadInner → Upload → CommitUploadInner
 *
 * @param buffer 文件 Buffer
 * @param mediaType "video" 或 "audio"
 * @param refreshToken 刷新令牌
 * @param filename 原始文件名（可选）
 * @returns { vid, width?, height?, duration?, fps? }
 */
async function uploadMediaForVideo(
  buffer: Buffer,
  mediaType: "video" | "audio",
  refreshToken: string,
  filename?: string
): Promise<{ vid: string; width?: number; height?: number; duration?: number; fps?: number }> {
  const label = mediaType === "audio" ? "音频" : "视频";
  const fileSize = buffer.length;
  logger.info(`开始上传${label}文件，大小: ${fileSize} 字节`);

  // 第一步：获取 VOD 上传令牌（scene=1）
  const tokenResult = await request("post", "/mweb/v1/get_upload_token", refreshToken, {
    data: { scene: 1 },
  });

  const { access_key_id, secret_access_key, session_token, space_name } = tokenResult;
  if (!access_key_id || !secret_access_key || !session_token) {
    throw new Error(`获取${label}上传令牌失败`);
  }

  const spaceName = space_name || "dreamina";
  logger.info(`获取${label}上传令牌成功: spaceName=${spaceName}`);

  // 第二步：申请 VOD 上传权限（ApplyUploadInner）
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const randomStr = Math.random().toString(36).substring(2, 12);

  const vodHost = "https://vod.bytedanceapi.com";
  const applyUrl = `${vodHost}/?Action=ApplyUploadInner&Version=2020-11-19&SpaceName=${spaceName}&FileType=video&IsInner=1&FileSize=${fileSize}&s=${randomStr}`;

  const requestHeaders: Record<string, string> = {
    'x-amz-date': timestamp,
    'x-amz-security-token': session_token,
  };

  const authorization = createSignature(
    'GET', applyUrl, requestHeaders,
    access_key_id, secret_access_key, session_token,
    '', 'cn-north-1', 'vod'
  );

  logger.info(`申请${label}上传权限: ${applyUrl}`);

  const applyResponse = await fetch(applyUrl, {
    method: 'GET',
    headers: {
      'accept': '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'authorization': authorization,
      'origin': 'https://jimeng.jianying.com',
      'referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      'x-amz-date': timestamp,
      'x-amz-security-token': session_token,
    },
  });

  if (!applyResponse.ok) {
    const errorText = await applyResponse.text();
    throw new Error(`申请${label}上传权限失败: ${applyResponse.status} - ${errorText}`);
  }

  const applyResult: any = await applyResponse.json();
  if (applyResult?.ResponseMetadata?.Error) {
    throw new Error(`申请${label}上传权限失败: ${JSON.stringify(applyResult.ResponseMetadata.Error)}`);
  }

  const uploadNodes = applyResult?.Result?.InnerUploadAddress?.UploadNodes;
  if (!uploadNodes || uploadNodes.length === 0) {
    throw new Error(`获取${label}上传节点失败: ${JSON.stringify(applyResult)}`);
  }

  const uploadNode = uploadNodes[0];
  const storeInfo = uploadNode.StoreInfos?.[0];
  if (!storeInfo) {
    throw new Error(`获取${label}上传存储信息失败: ${JSON.stringify(uploadNode)}`);
  }

  const uploadHost = uploadNode.UploadHost;
  const storeUri = storeInfo.StoreUri;
  const auth = storeInfo.Auth;
  const sessionKey = uploadNode.SessionKey;
  const vid = uploadNode.Vid;

  logger.info(`获取${label}上传节点成功: host=${uploadHost}, vid=${vid}`);

  // 第三步：上传文件
  const uploadUrl = `https://${uploadHost}/upload/v1/${storeUri}`;
  const crc32 = calculateCRC32(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

  logger.info(`开始上传${label}文件: ${uploadUrl}, CRC32=${crc32}`);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Accept': '*/*',
      'Authorization': auth,
      'Content-CRC32': crc32,
      'Content-Type': 'application/octet-stream',
      'Origin': 'https://jimeng.jianying.com',
      'Referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`${label}文件上传失败: ${uploadResponse.status} - ${errorText}`);
  }

  const uploadData: any = await uploadResponse.json();
  if (uploadData?.code !== 2000) {
    throw new Error(`${label}文件上传失败: code=${uploadData?.code}, message=${uploadData?.message}`);
  }

  logger.info(`${label}文件上传成功: crc32=${uploadData.data?.crc32}`);

  // 第四步：确认上传（CommitUploadInner）
  const commitUrl = `${vodHost}/?Action=CommitUploadInner&Version=2020-11-19&SpaceName=${spaceName}`;
  const commitTimestamp = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const commitPayload = JSON.stringify({
    SessionKey: sessionKey,
    Functions: [],
  });

  const payloadHash = crypto.createHash('sha256').update(commitPayload, 'utf8').digest('hex');

  const commitRequestHeaders: Record<string, string> = {
    'x-amz-date': commitTimestamp,
    'x-amz-security-token': session_token,
    'x-amz-content-sha256': payloadHash,
  };

  const commitAuthorization = createSignature(
    'POST', commitUrl, commitRequestHeaders,
    access_key_id, secret_access_key, session_token,
    commitPayload, 'cn-north-1', 'vod'
  );

  logger.info(`提交${label}上传确认: ${commitUrl}`);

  const commitResponse = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'accept': '*/*',
      'authorization': commitAuthorization,
      'content-type': 'application/json',
      'origin': 'https://jimeng.jianying.com',
      'referer': 'https://jimeng.jianying.com/ai-tool/video/generate',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      'x-amz-date': commitTimestamp,
      'x-amz-security-token': session_token,
      'x-amz-content-sha256': payloadHash,
    },
    body: commitPayload,
  });

  if (!commitResponse.ok) {
    const errorText = await commitResponse.text();
    throw new Error(`提交${label}上传失败: ${commitResponse.status} - ${errorText}`);
  }

  const commitResult: any = await commitResponse.json();
  if (commitResult?.ResponseMetadata?.Error) {
    throw new Error(`提交${label}上传失败: ${JSON.stringify(commitResult.ResponseMetadata.Error)}`);
  }

  if (!commitResult?.Result?.Results || commitResult.Result.Results.length === 0) {
    throw new Error(`提交${label}上传响应缺少结果: ${JSON.stringify(commitResult)}`);
  }

  const result = commitResult.Result.Results[0];
  if (!result.Vid) {
    throw new Error(`提交${label}上传响应缺少 Vid: ${JSON.stringify(result)}`);
  }

  // 从 VOD 返回的元数据中获取信息（音频有 Duration）
  const videoMeta = result.VideoMeta || {};
  let duration = videoMeta.Duration ? Math.round(videoMeta.Duration * 1000) : 0;

  // 如果 VOD 未返回时长，用本地解析兜底
  if (duration <= 0 && mediaType === "audio") {
    duration = parseAudioDuration(buffer);
    logger.info(`VOD 未返回${label}时长，本地解析: ${duration}ms`);
  }

  logger.info(`${label}上传完成: vid=${result.Vid}, duration=${duration}ms`);

  return {
    vid: result.Vid,
    width: videoMeta.Width || 0,
    height: videoMeta.Height || 0,
    duration,
    fps: videoMeta.Fps || 0,
  };
}

/**
 * 通过 get_local_item_list API 获取高质量视频下载URL
 * 浏览器下载视频时使用此API获取高码率版本（~6297 vs 预览版 ~1152）
 *
 * @param itemId 视频项目ID
 * @param refreshToken 刷新令牌
 * @returns 高质量视频URL，失败时返回 null
 */
async function fetchHighQualityVideoUrl(itemId: string, refreshToken: string): Promise<string | null> {
  try {
    logger.info(`尝试获取高质量视频下载URL，item_id: ${itemId}`);

    const result = await request("post", "/mweb/v1/get_local_item_list", refreshToken, {
      data: {
        item_id_list: [itemId],
        pack_item_opt: {
          scene: 1,
          need_data_integrity: true,
        },
        is_for_video_download: true,
      },
    });

    const responseStr = JSON.stringify(result);
    logger.info(`get_local_item_list 响应大小: ${responseStr.length} 字符`);

    // 策略1: 从结构化字段中提取视频URL
    const itemList = result.item_list || result.local_item_list || [];
    if (itemList.length > 0) {
      const item = itemList[0];
      const videoUrl =
        item?.video?.transcoded_video?.origin?.video_url ||
        item?.video?.download_url ||
        item?.video?.play_url ||
        item?.video?.url;

      if (videoUrl) {
        logger.info(`从get_local_item_list结构化字段获取到高清视频URL: ${videoUrl}`);
        return videoUrl;
      }
    }

    // 策略2: 正则匹配 dreamnia.jimeng.com 高质量URL
    const hqUrlMatch = responseStr.match(/https:\/\/v[0-9]+-dreamnia\.jimeng\.com\/[^"\s\\]+/);
    if (hqUrlMatch && hqUrlMatch[0]) {
      logger.info(`正则提取到高质量视频URL (dreamnia): ${hqUrlMatch[0]}`);
      return hqUrlMatch[0];
    }

    // 策略3: 匹配任何 jimeng.com 域名的视频URL
    const jimengUrlMatch = responseStr.match(/https:\/\/v[0-9]+-[^"\\]*\.jimeng\.com\/[^"\s\\]+/);
    if (jimengUrlMatch && jimengUrlMatch[0]) {
      logger.info(`正则提取到jimeng视频URL: ${jimengUrlMatch[0]}`);
      return jimengUrlMatch[0];
    }

    // 策略4: 匹配任何视频URL（兜底）
    const anyVideoUrlMatch = responseStr.match(/https:\/\/v[0-9]+-[^"\\]*\.(vlabvod|jimeng)\.com\/[^"\s\\]+/);
    if (anyVideoUrlMatch && anyVideoUrlMatch[0]) {
      logger.info(`从get_local_item_list提取到视频URL: ${anyVideoUrlMatch[0]}`);
      return anyVideoUrlMatch[0];
    }

    logger.warn(`未能从get_local_item_list响应中提取到视频URL`);
    return null;
  } catch (error) {
    logger.warn(`获取高质量视频下载URL失败: ${error.message}`);
    return null;
  }
}

/**
 * 生成视频
 *
 * @param _model 模型名称
 * @param prompt 提示词
 * @param options 选项
 * @param refreshToken 刷新令牌
 * @returns 视频URL
 */
export async function generateVideo(
  _model: string,
  prompt: string,
  {
    ratio = "1:1",
    resolution = "720p",
    duration = 5,
    filePaths = [],
    files = [],
  }: {
    ratio?: string;
    resolution?: string;
    duration?: number;
    filePaths?: string[];
    files?: any[];
  },
  refreshToken: string
) {
  const model = getModel(_model);

  // 解析分辨率参数获取实际的宽高
  const { width, height } = resolveVideoResolution(resolution, ratio);

  logger.info(`使用模型: ${_model} 映射模型: ${model} ${width}x${height} (${ratio}@${resolution}) 时长: ${duration}秒`);

  // 检查积分
  const { totalCredit } = await getCredit(refreshToken);
  if (totalCredit <= 0)
    await receiveCredit(refreshToken);

  // 处理首帧和尾帧图片
  let first_frame_image = undefined;
  let end_frame_image = undefined;

  // 处理上传的文件（multipart/form-data）
  if (files && files.length > 0) {
    let uploadIDs: string[] = [];
    logger.info(`开始处理 ${files.length} 个上传文件用于视频生成`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || !file.filepath) {
        logger.warn(`第 ${i + 1} 个文件无效，跳过`);
        continue;
      }

      try {
        logger.info(`开始上传第 ${i + 1} 个文件: ${file.originalFilename || file.filepath}`);

        // 读取文件内容并上传
        const buffer = fs.readFileSync(file.filepath);
        const imageUri = await uploadImageBufferForVideo(buffer, refreshToken);

        if (imageUri) {
          uploadIDs.push(imageUri);
          logger.info(`第 ${i + 1} 个文件上传成功: ${imageUri}`);
        } else {
          logger.error(`第 ${i + 1} 个文件上传失败: 未获取到 image_uri`);
        }
      } catch (error) {
        logger.error(`第 ${i + 1} 个文件上传失败: ${error.message}`);

        if (i === 0) {
          logger.error(`首帧文件上传失败，停止视频生成以避免浪费积分`);
          throw new APIException(EX.API_REQUEST_FAILED, `首帧文件上传失败: ${error.message}`);
        } else {
          logger.warn(`第 ${i + 1} 个文件上传失败，将跳过此文件继续处理`);
        }
      }
    }

    logger.info(`文件上传完成，成功上传 ${uploadIDs.length} 个文件`);

    if (uploadIDs.length === 0) {
      logger.error(`所有文件上传失败，停止视频生成以避免浪费积分`);
      throw new APIException(EX.API_REQUEST_FAILED, '所有文件上传失败，请检查文件是否有效');
    }

    // 构建首帧图片对象
    if (uploadIDs[0]) {
      first_frame_image = {
        format: "",
        height: height,
        id: util.uuid(),
        image_uri: uploadIDs[0],
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: uploadIDs[0],
        width: width,
      };
      logger.info(`设置首帧图片: ${uploadIDs[0]}`);
    }

    // 构建尾帧图片对象
    if (uploadIDs[1]) {
      end_frame_image = {
        format: "",
        height: height,
        id: util.uuid(),
        image_uri: uploadIDs[1],
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: uploadIDs[1],
        width: width,
      };
      logger.info(`设置尾帧图片: ${uploadIDs[1]}`);
    }
  } else if (filePaths && filePaths.length > 0) {
    let uploadIDs: string[] = [];
    logger.info(`开始上传 ${filePaths.length} 张图片用于视频生成`);
    
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      if (!filePath) {
        logger.warn(`第 ${i + 1} 张图片路径为空，跳过`);
        continue;
      }
      
      try {
        logger.info(`开始上传第 ${i + 1} 张图片: ${filePath}`);
        
        // 使用Amazon S3上传方式
        const imageUri = await uploadImageForVideo(filePath, refreshToken);
        
        if (imageUri) {
          uploadIDs.push(imageUri);
          logger.info(`第 ${i + 1} 张图片上传成功: ${imageUri}`);
        } else {
          logger.error(`第 ${i + 1} 张图片上传失败: 未获取到 image_uri`);
        }
      } catch (error) {
        logger.error(`第 ${i + 1} 张图片上传失败: ${error.message}`);
        
        // 图片上传失败时，停止视频生成避免浪费积分
        if (i === 0) {
          logger.error(`首帧图片上传失败，停止视频生成以避免浪费积分`);
          throw new APIException(EX.API_REQUEST_FAILED, `首帧图片上传失败: ${error.message}`);
        } else {
          logger.warn(`第 ${i + 1} 张图片上传失败，将跳过此图片继续处理`);
        }
      }
    }
    
    logger.info(`图片上传完成，成功上传 ${uploadIDs.length} 张图片`);
    
    // 如果没有成功上传任何图片，停止视频生成
    if (uploadIDs.length === 0) {
      logger.error(`所有图片上传失败，停止视频生成以避免浪费积分`);
      throw new APIException(EX.API_REQUEST_FAILED, '所有图片上传失败，请检查图片URL是否有效');
    }
    
    // 构建首帧图片对象
    if (uploadIDs[0]) {
      first_frame_image = {
        format: "",
        height: height,
        id: util.uuid(),
        image_uri: uploadIDs[0],
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: uploadIDs[0],
        width: width,
      };
      logger.info(`设置首帧图片: ${uploadIDs[0]}`);
    }
    
    // 构建尾帧图片对象
    if (uploadIDs[1]) {
      end_frame_image = {
        format: "",
        height: height,
        id: util.uuid(),
        image_uri: uploadIDs[1],
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: uploadIDs[1],
        width: width,
      };
      logger.info(`设置尾帧图片: ${uploadIDs[1]}`);
    } else if (filePaths.length > 1) {
      logger.warn(`第二张图片上传失败或未提供，将仅使用首帧图片`);
    }
  } else {
    logger.info(`未提供图片文件，将进行纯文本视频生成`);
  }

  const componentId = util.uuid();
  const metricsExtra = JSON.stringify({
    "enterFrom": "click",
    "isDefaultSeed": 1,
    "promptSource": "custom",
    "isRegenerate": false,
    "originSubmitId": util.uuid(),
  });
  
  // 获取当前模型的 draft 版本
  const draftVersion = MODEL_DRAFT_VERSIONS[_model] || DEFAULT_DRAFT_VERSION;
  
  // 计算视频宽高比
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const aspectRatio = `${width / divisor}:${height / divisor}`;
  
  // 构建请求参数
  const { aigc_data } = await request(
    "post",
    "/mweb/v1/aigc_draft/generate",
    refreshToken,
    {
      params: {
        aigc_features: "app_lip_sync",
        web_version: "6.6.0",
        da_version: draftVersion,
      },
      data: {
        "extend": {
          "root_model": end_frame_image ? MODEL_MAP['jimeng-video-3.0'] : model,
          "m_video_commerce_info": {
            benefit_type: "basic_video_operation_vgfm_v_three",
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc"
          },
          "m_video_commerce_info_list": [{
            benefit_type: "basic_video_operation_vgfm_v_three",
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc"
          }]
        },
        "submit_id": util.uuid(),
        "metrics_extra": metricsExtra,
        "draft_content": JSON.stringify({
          "type": "draft",
          "id": util.uuid(),
          "min_version": "3.0.5",
          "is_from_tsn": true,
          "version": draftVersion,
          "main_component_id": componentId,
          "component_list": [{
            "type": "video_base_component",
            "id": componentId,
            "min_version": "1.0.0",
            "metadata": {
              "type": "",
              "id": util.uuid(),
              "created_platform": 3,
              "created_platform_version": "",
              "created_time_in_ms": Date.now(),
              "created_did": ""
            },
            "generate_type": "gen_video",
            "aigc_mode": "workbench",
            "abilities": {
              "type": "",
              "id": util.uuid(),
              "gen_video": {
                "id": util.uuid(),
                "type": "",
                "text_to_video_params": {
                  "type": "",
                  "id": util.uuid(),
                  "model_req_key": model,
                  "priority": 0,
                  "seed": Math.floor(Math.random() * 100000000) + 2500000000,
                  "video_aspect_ratio": aspectRatio,
                  "video_gen_inputs": [{
                    duration_ms: duration * 1000,
                    first_frame_image: first_frame_image,
                    end_frame_image: end_frame_image,
                    fps: 24,
                    id: util.uuid(),
                    min_version: "3.0.5",
                    prompt: prompt,
                    resolution: resolution,
                    type: "",
                    video_mode: 2
                  }]
                },
                "video_task_extra": metricsExtra,
              }
            }
          }],
        }),
        http_common_info: {
          aid: DEFAULT_ASSISTANT_ID,
        },
      },
    }
  );

  const historyId = aigc_data.history_record_id;
  if (!historyId)
    throw new APIException(EX.API_IMAGE_GENERATION_FAILED, "记录ID不存在");

  // 轮询获取结果
  let status = 20, failCode, item_list = [];
  let retryCount = 0;
  const maxRetries = 60; // 增加重试次数，支持约20分钟的总重试时间
  
  // 首次查询前等待更长时间，让服务器有时间处理请求
  await new Promise((resolve) => setTimeout(resolve, 5000));
  
  logger.info(`开始轮询视频生成结果，历史ID: ${historyId}，最大重试次数: ${maxRetries}`);
  logger.info(`即梦官网API地址: https://jimeng.jianying.com/mweb/v1/get_history_by_ids`);
  logger.info(`视频生成请求已发送，请同时在即梦官网查看: https://jimeng.jianying.com/ai-tool/video/generate`);
  
  while (status === 20 && retryCount < maxRetries) {
    try {
      // 构建请求URL和参数
      const requestUrl = "/mweb/v1/get_history_by_ids";
      const requestData = {
        history_ids: [historyId],
      };
      
      // 尝试两种不同的API请求方式
      let result;
      let useAlternativeApi = retryCount > 10 && retryCount % 2 === 0; // 在重试10次后，每隔一次尝试备用API
      
      if (useAlternativeApi) {
        // 备用API请求方式
        logger.info(`尝试备用API请求方式，URL: ${requestUrl}, 历史ID: ${historyId}, 重试次数: ${retryCount + 1}/${maxRetries}`);
        const alternativeRequestData = {
          history_record_ids: [historyId],
        };
        result = await request("post", "/mweb/v1/get_history_records", refreshToken, {
          data: alternativeRequestData,
        });
        logger.info(`备用API响应摘要: ${JSON.stringify(result).substring(0, 500)}...`);
      } else {
        // 标准API请求方式
        logger.info(`发送请求获取视频生成结果，URL: ${requestUrl}, 历史ID: ${historyId}, 重试次数: ${retryCount + 1}/${maxRetries}`);
        result = await request("post", requestUrl, refreshToken, {
          data: requestData,
        });
        const responseStr = JSON.stringify(result);
        logger.info(`标准API响应摘要: ${responseStr.substring(0, 300)}...`);
      }
      

      // 检查结果是否有效
      let historyData;
      
      if (useAlternativeApi && result.history_records && result.history_records.length > 0) {
        // 处理备用API返回的数据格式
        historyData = result.history_records[0];
        logger.info(`从备用API获取到历史记录`);
      } else if (result.history_list && result.history_list.length > 0) {
        // 处理标准API返回的数据格式
        historyData = result.history_list[0];
        logger.info(`从标准API获取到历史记录`);
      } else if (result[historyId]) {
        // get_history_by_ids 返回数据以 historyId 为键（如 result["8918159809292"]）
        historyData = result[historyId];
        logger.info(`从historyId键获取到历史记录`);
      } else {
        // 所有API都没有返回有效数据
        logger.warn(`历史记录不存在，重试中 (${retryCount + 1}/${maxRetries})... 历史ID: ${historyId}`);
        logger.info(`请同时在即梦官网检查视频是否已生成: https://jimeng.jianying.com/ai-tool/video/generate`);

        retryCount++;
        // 增加重试间隔时间，但设置上限为30秒
        const waitTime = Math.min(2000 * (retryCount + 1), 30000);
        logger.info(`等待 ${waitTime}ms 后进行第 ${retryCount + 1} 次重试`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      
      // 记录获取到的结果详情
      logger.info(`获取到历史记录结果: ${JSON.stringify(historyData)}`);
      

      // 从历史数据中提取状态和结果
      status = historyData.status;
      failCode = historyData.fail_code;
      item_list = historyData.item_list || [];
      
      logger.info(`视频生成状态: ${status}, 失败代码: ${failCode || '无'}, 项目列表长度: ${item_list.length}`);
      
      // 如果有视频URL，提前记录
      let tempVideoUrl = item_list?.[0]?.video?.transcoded_video?.origin?.video_url;
      if (!tempVideoUrl) {
        // 尝试从其他可能的路径获取
        tempVideoUrl = item_list?.[0]?.video?.play_url || 
                      item_list?.[0]?.video?.download_url || 
                      item_list?.[0]?.video?.url;
      }
      
      if (tempVideoUrl) {
        logger.info(`检测到视频URL: ${tempVideoUrl}`);
      }

      if (status === 30) {
        const error = failCode === 2038 
          ? new APIException(EX.API_CONTENT_FILTERED, "内容被过滤")
          : new APIException(EX.API_IMAGE_GENERATION_FAILED, `生成失败，错误码: ${failCode}`);
        // 添加历史ID到错误对象，以便在chat.ts中显示
        error.historyId = historyId;
        throw error;
      }
      
      // 如果状态仍在处理中，等待后继续
      if (status === 20) {
        const waitTime = 2000 * (Math.min(retryCount + 1, 5)); // 随着重试次数增加等待时间，但最多10秒
        logger.info(`视频生成中，状态码: ${status}，等待 ${waitTime}ms 后继续查询`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      logger.error(`轮询视频生成结果出错: ${error.message}`);
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (retryCount + 1)));
    }
  }
  
  // 如果达到最大重试次数仍未成功
  if (retryCount >= maxRetries && status === 20) {
    logger.error(`视频生成超时，已尝试 ${retryCount} 次，总耗时约 ${Math.floor(retryCount * 2000 / 1000 / 60)} 分钟`);
    const error = new APIException(EX.API_IMAGE_GENERATION_FAILED, "获取视频生成结果超时，请稍后在即梦官网查看您的视频");
    // 添加历史ID到错误对象，以便在chat.ts中显示
    error.historyId = historyId;
    throw error;
  }

  // 尝试通过 get_local_item_list 获取高质量视频下载URL
  const itemId = item_list?.[0]?.item_id
    || item_list?.[0]?.id
    || item_list?.[0]?.local_item_id
    || item_list?.[0]?.common_attr?.id;

  if (itemId) {
    try {
      const hqVideoUrl = await fetchHighQualityVideoUrl(String(itemId), refreshToken);
      if (hqVideoUrl) {
        logger.info(`视频生成成功（高质量），URL: ${hqVideoUrl}`);
        return hqVideoUrl;
      }
    } catch (error) {
      logger.warn(`获取高质量视频URL失败，将使用预览URL作为回退: ${error.message}`);
    }
  } else {
    logger.warn(`未能从item_list中提取item_id，将使用预览URL。item_list[0]键: ${item_list?.[0] ? Object.keys(item_list[0]).join(', ') : '无'}`);
  }

  // 回退：提取预览视频URL
  let videoUrl = item_list?.[0]?.video?.transcoded_video?.origin?.video_url;
  
  // 如果通过常规路径无法获取视频URL，尝试其他可能的路径
  if (!videoUrl) {
    // 尝试从item_list中的其他可能位置获取
    if (item_list?.[0]?.video?.play_url) {
      videoUrl = item_list[0].video.play_url;
      logger.info(`从play_url获取到视频URL: ${videoUrl}`);
    } else if (item_list?.[0]?.video?.download_url) {
      videoUrl = item_list[0].video.download_url;
      logger.info(`从download_url获取到视频URL: ${videoUrl}`);
    } else if (item_list?.[0]?.video?.url) {
      videoUrl = item_list[0].video.url;
      logger.info(`从url获取到视频URL: ${videoUrl}`);
    } else {
      // 如果仍然找不到，记录错误并抛出异常
      logger.error(`未能获取视频URL，item_list: ${JSON.stringify(item_list)}`);
      const error = new APIException(EX.API_IMAGE_GENERATION_FAILED, "未能获取视频URL，请稍后在即梦官网查看");
      // 添加历史ID到错误对象，以便在chat.ts中显示
      error.historyId = historyId;
      throw error;
    }
  }

  logger.info(`视频生成成功，URL: ${videoUrl}`);
  return videoUrl;
}

/**
 * Seedance 2.0 多图智能视频生成
 * 支持多张图片与文本混合生成视频
 *
 * @param _model 模型名称
 * @param prompt 提示词（支持 @1 @2 等引用图片占位符）
 * @param options 选项
 * @param refreshToken 刷新令牌
 * @returns 视频URL
 */
export async function generateSeedanceVideo(
  _model: string,
  prompt: string,
  {
    ratio = "4:3",
    resolution = "720p",
    duration = 4,
    filePaths = [],
    files = [],
  }: {
    ratio?: string;
    resolution?: string;
    duration?: number;
    filePaths?: string[];
    files?: any[];
  },
  refreshToken: string
) {
  const model = getModel(_model);
  const benefitType = SEEDANCE_BENEFIT_TYPE_MAP[_model] || "dreamina_video_seedance_20_pro";

  // Seedance 2.0 默认时长为4秒
  const actualDuration = duration || 4;

  // 解析分辨率参数获取实际的宽高
  const { width, height } = resolveVideoResolution(resolution, ratio);

  logger.info(`Seedance 2.0 生成: 模型=${_model} 映射=${model} ${width}x${height} (${ratio}@${resolution}) 时长=${actualDuration}秒`);

  // 检查积分
  const { totalCredit } = await getCredit(refreshToken);
  if (totalCredit <= 0)
    await receiveCredit(refreshToken);

  // 上传所有文件（支持图片/视频/音频）
  let uploadedMaterials: UploadedMaterial[] = [];

  // 处理上传的文件（multipart/form-data）
  if (files && files.length > 0) {
    logger.info(`Seedance: 开始处理 ${files.length} 个上传文件`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || !file.filepath) {
        logger.warn(`Seedance: 第 ${i + 1} 个文件无效，跳过`);
        continue;
      }

      const materialType = detectMaterialType(file);
      try {
        logger.info(`Seedance: 开始上传第 ${i + 1} 个文件 (${materialType}): ${file.originalFilename || file.filepath}`);
        const buffer = fs.readFileSync(file.filepath);

        if (materialType === "image") {
          const imageUri = await uploadImageBufferForVideo(buffer, refreshToken);
          if (imageUri) {
            uploadedMaterials.push({ type: "image", uri: imageUri, width, height });
            logger.info(`Seedance: 第 ${i + 1} 个图片上传成功: ${imageUri}`);
          }
        } else {
          // 视频或音频 → VOD 上传
          const vodResult = await uploadMediaForVideo(buffer, materialType, refreshToken, file.originalFilename);
          uploadedMaterials.push({
            type: materialType,
            vid: vodResult.vid,
            width: vodResult.width,
            height: vodResult.height,
            duration: vodResult.duration,
            fps: vodResult.fps,
            name: file.originalFilename || "",
          });
          logger.info(`Seedance: 第 ${i + 1} 个${materialType === "video" ? "视频" : "音频"}上传成功: ${vodResult.vid}`);
        }
      } catch (error) {
        logger.error(`Seedance: 第 ${i + 1} 个文件上传失败: ${error.message}`);
        if (i === 0) {
          throw new APIException(EX.API_REQUEST_FAILED, `首个文件上传失败: ${error.message}`);
        }
      }
    }
  } else if (filePaths && filePaths.length > 0) {
    logger.info(`Seedance: 开始上传 ${filePaths.length} 个文件`);

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      if (!filePath) continue;

      const materialType = detectMaterialTypeFromUrl(filePath);
      try {
        logger.info(`Seedance: 开始上传第 ${i + 1} 个文件 (${materialType}): ${filePath}`);

        if (materialType === "image") {
          const imageUri = await uploadImageForVideo(filePath, refreshToken);
          if (imageUri) {
            uploadedMaterials.push({ type: "image", uri: imageUri, width, height });
            logger.info(`Seedance: 第 ${i + 1} 个图片上传成功: ${imageUri}`);
          }
        } else {
          // 视频或音频 URL → 下载后 VOD 上传
          const response = await fetch(filePath);
          if (!response.ok) throw new Error(`下载文件失败: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const vodResult = await uploadMediaForVideo(buffer, materialType, refreshToken);
          uploadedMaterials.push({
            type: materialType,
            vid: vodResult.vid,
            width: vodResult.width,
            height: vodResult.height,
            duration: vodResult.duration,
            fps: vodResult.fps,
          });
          logger.info(`Seedance: 第 ${i + 1} 个${materialType === "video" ? "视频" : "音频"}上传成功: ${vodResult.vid}`);
        }
      } catch (error) {
        logger.error(`Seedance: 第 ${i + 1} 个文件上传失败: ${error.message}`);
        if (i === 0) {
          throw new APIException(EX.API_REQUEST_FAILED, `首个文件上传失败: ${error.message}`);
        }
      }
    }
  }

  if (uploadedMaterials.length === 0) {
    throw new APIException(EX.API_REQUEST_FAILED, 'Seedance 2.0 需要至少一个文件（图片/视频/音频）');
  }

  logger.info(`Seedance: 成功上传 ${uploadedMaterials.length} 个文件`);

  // 动态 benefit_type：包含视频素材时追加 _with_video 后缀
  const hasVideoMaterial = uploadedMaterials.some(m => m.type === "video");
  const finalBenefitType = hasVideoMaterial ? `${benefitType}_with_video` : benefitType;

  // 构建 material_list（支持图片/视频/音频）
  const materialList = uploadedMaterials.map((mat) => {
    const base = { type: "", id: util.uuid() };
    if (mat.type === "image") {
      return {
        ...base,
        material_type: "image",
        image_info: {
          type: "image",
          id: util.uuid(),
          source_from: "upload",
          platform_type: 1,
          name: "",
          image_uri: mat.uri,
          aigc_image: { type: "", id: util.uuid() },
          width: mat.width,
          height: mat.height,
          format: "",
          uri: mat.uri,
        }
      };
    } else if (mat.type === "video") {
      return {
        ...base,
        material_type: "video",
        video_info: {
          type: "video",
          id: util.uuid(),
          source_from: "upload",
          name: mat.name || "",
          vid: mat.vid,
          fps: mat.fps || 0,
          width: mat.width || 0,
          height: mat.height || 0,
          duration: mat.duration || 0,
        }
      };
    } else {
      // audio
      return {
        ...base,
        material_type: "audio",
        audio_info: {
          type: "audio",
          id: util.uuid(),
          source_from: "upload",
          vid: mat.vid,
          duration: mat.duration || 0,
          name: mat.name || "",
        }
      };
    }
  });

  // 解析 prompt 中的素材占位符（@1, @2 等）并构建 meta_list
  const metaList = buildMetaListFromPrompt(prompt, uploadedMaterials);

  const componentId = util.uuid();
  const submitId = util.uuid();
  const draftVersion = MODEL_DRAFT_VERSIONS[_model] || "3.3.9";

  // 计算视频宽高比
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const aspectRatio = `${width / divisor}:${height / divisor}`;

  const metricsExtra = JSON.stringify({
    isDefaultSeed: 1,
    originSubmitId: submitId,
    isRegenerate: false,
    enterFrom: "click",
    position: "page_bottom_box",
    functionMode: "omni_reference",
    sceneOptions: JSON.stringify([{
      type: "video",
      scene: "BasicVideoGenerateButton",
      modelReqKey: model,
      videoDuration: actualDuration,
      reportParams: {
        enterSource: "generate",
        vipSource: "generate",
        extraVipFunctionKey: model,
        useVipFunctionDetailsReporterHoc: true
      },
      materialTypes: [...new Set(uploadedMaterials.map(m => MATERIAL_TYPE_CODE[m.type]))]
    }])
  });

  // 构建 Seedance 2.0 专用请求（通过浏览器代理，绕过 shark a_bogus 检测）
  const token = await acquireToken(refreshToken);
  const generateQueryParams = new URLSearchParams({
    aid: String(CORE_ASSISTANT_ID),
    device_platform: "web",
    region: "cn",
    webId: String(WEB_ID),
    da_version: draftVersion,
    web_component_open_flag: "1",
    web_version: "7.5.0",
    aigc_features: "app_lip_sync",
  });
  const generateUrl = `https://jimeng.jianying.com/mweb/v1/aigc_draft/generate?${generateQueryParams.toString()}`;
  const generateBody = {
    extend: {
      root_model: model,
      m_video_commerce_info: {
        benefit_type: finalBenefitType,
        resource_id: "generate_video",
        resource_id_type: "str",
        resource_sub_type: "aigc"
      },
      m_video_commerce_info_list: [{
        benefit_type: finalBenefitType,
        resource_id: "generate_video",
        resource_id_type: "str",
        resource_sub_type: "aigc"
      }]
    },
    submit_id: submitId,
    metrics_extra: metricsExtra,
    draft_content: JSON.stringify({
      type: "draft",
      id: util.uuid(),
      min_version: draftVersion,
      min_features: ["AIGC_Video_UnifiedEdit"],
      is_from_tsn: true,
      version: draftVersion,
      main_component_id: componentId,
      component_list: [{
        type: "video_base_component",
        id: componentId,
        min_version: "1.0.0",
        aigc_mode: "workbench",
        metadata: {
          type: "",
          id: util.uuid(),
          created_platform: 3,
          created_platform_version: "",
          created_time_in_ms: String(Date.now()),
          created_did: ""
        },
        generate_type: "gen_video",
        abilities: {
          type: "",
          id: util.uuid(),
          gen_video: {
            type: "",
            id: util.uuid(),
            text_to_video_params: {
              type: "",
              id: util.uuid(),
              video_gen_inputs: [{
                type: "",
                id: util.uuid(),
                min_version: draftVersion,
                prompt: "",  // Seedance 2.0 prompt 在 meta_list 中
                video_mode: 2,
                fps: 24,
                duration_ms: actualDuration * 1000,
                idip_meta_list: [],
                unified_edit_input: {
                  type: "",
                  id: util.uuid(),
                  material_list: materialList,
                  meta_list: metaList
                }
              }],
              video_aspect_ratio: aspectRatio,
              seed: Math.floor(Math.random() * 1000000000),
              model_req_key: model,
              priority: 0
            },
            video_task_extra: metricsExtra
          }
        },
        process_type: 1
      }]
    }),
    http_common_info: {
      aid: CORE_ASSISTANT_ID,
    },
  };

  logger.info(`Seedance: 通过浏览器代理发送 generate 请求...`);
  const generateResult = await browserService.fetch(
    token,
    generateUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generateBody),
    }
  );

  // 检查浏览器代理返回的结果
  const { ret, errmsg, data: generateData } = generateResult;
  if (ret !== undefined && Number(ret) !== 0) {
    if (Number(ret) === 5000) {
      throw new APIException(EX.API_IMAGE_GENERATION_INSUFFICIENT_POINTS, `[无法生成视频]: 即梦积分可能不足，${errmsg}`);
    }
    throw new APIException(EX.API_REQUEST_FAILED, `[请求jimeng失败]: ${errmsg}`);
  }
  const aigc_data = generateData?.aigc_data || generateResult.aigc_data;

  const historyId = aigc_data.history_record_id;
  if (!historyId)
    throw new APIException(EX.API_IMAGE_GENERATION_FAILED, "记录ID不存在");

  // 轮询获取结果（与普通视频相同的逻辑）
  let status = 20, failCode, item_list = [];
  let retryCount = 0;
  const maxRetries = 60;

  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.info(`Seedance: 开始轮询视频生成结果，历史ID: ${historyId}`);

  while (status === 20 && retryCount < maxRetries) {
    try {
      const result = await request("post", "/mweb/v1/get_history_by_ids", refreshToken, {
        data: { history_ids: [historyId] },
      });

      const responseStr = JSON.stringify(result);
      logger.info(`Seedance: 轮询响应摘要: ${responseStr.substring(0, 300)}...`);

      // get_history_by_ids 返回的数据可能以 historyId 为键（如 result["8918159809292"]），
      // 也可能在 result.history_list 数组中
      let historyData = result.history_list?.[0] || result[historyId];

      if (!historyData) {
        retryCount++;
        const waitTime = Math.min(2000 * (retryCount + 1), 30000);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      status = historyData.status;
      failCode = historyData.fail_code;
      item_list = historyData.item_list || [];

      logger.info(`Seedance: 状态=${status}, 失败码=${failCode || '无'}`);

      if (status === 30) {
        const error = failCode === 2038
          ? new APIException(EX.API_CONTENT_FILTERED, "内容被过滤")
          : new APIException(EX.API_IMAGE_GENERATION_FAILED, `生成失败，错误码: ${failCode}`);
        error.historyId = historyId;
        throw error;
      }

      if (status === 20) {
        const waitTime = 2000 * Math.min(retryCount + 1, 5);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      retryCount++;
    } catch (error) {
      if (error instanceof APIException) throw error;
      logger.error(`Seedance: 轮询出错: ${error.message}`);
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (retryCount + 1)));
    }
  }

  if (retryCount >= maxRetries && status === 20) {
    const error = new APIException(EX.API_IMAGE_GENERATION_FAILED, "视频生成超时");
    error.historyId = historyId;
    throw error;
  }

  // 尝试通过 get_local_item_list 获取高质量视频下载URL
  const seedanceItemId = item_list?.[0]?.item_id
    || item_list?.[0]?.id
    || item_list?.[0]?.local_item_id
    || item_list?.[0]?.common_attr?.id;

  if (seedanceItemId) {
    try {
      const hqVideoUrl = await fetchHighQualityVideoUrl(String(seedanceItemId), refreshToken);
      if (hqVideoUrl) {
        logger.info(`Seedance: 视频生成成功（高质量），URL: ${hqVideoUrl}`);
        return hqVideoUrl;
      }
    } catch (error) {
      logger.warn(`Seedance: 获取高质量视频URL失败，将使用预览URL作为回退: ${error.message}`);
    }
  } else {
    logger.warn(`Seedance: 未能从item_list中提取item_id，将使用预览URL。item_list[0]键: ${item_list?.[0] ? Object.keys(item_list[0]).join(', ') : '无'}`);
  }

  // 回退：提取预览视频URL
  let videoUrl = item_list?.[0]?.video?.transcoded_video?.origin?.video_url
    || item_list?.[0]?.video?.play_url
    || item_list?.[0]?.video?.download_url
    || item_list?.[0]?.video?.url;

  if (!videoUrl) {
    const error = new APIException(EX.API_IMAGE_GENERATION_FAILED, "未能获取视频URL");
    error.historyId = historyId;
    throw error;
  }

  logger.info(`Seedance: 视频生成成功，URL: ${videoUrl}`);
  return videoUrl;
}

/**
 * 解析 prompt 中的素材占位符并构建 meta_list
 * 支持格式: "使用 @1 图片，@2 图片做动画" -> [text, material(0), text, material(1), text]
 * meta_type 根据素材实际类型动态匹配（image/video/audio）
 */
function buildMetaListFromPrompt(prompt: string, materials: Array<{ type: SeedanceMaterialType }>): Array<{meta_type: string, text?: string, material_ref?: {material_idx: number}}> {
  const metaList: Array<{meta_type: string, text?: string, material_ref?: {material_idx: number}}> = [];
  const materialCount = materials.length;

  // 匹配 @1, @2, @图1, @图2, @image1 等格式
  const placeholderRegex = /@(?:图|image)?(\d+)/gi;

  let lastIndex = 0;
  let match;

  while ((match = placeholderRegex.exec(prompt)) !== null) {
    // 添加占位符前的文本
    if (match.index > lastIndex) {
      const textBefore = prompt.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        metaList.push({ meta_type: "text", text: textBefore });
      }
    }

    // 添加素材引用（使用对应素材的类型作为 meta_type）
    const materialIndex = parseInt(match[1]) - 1; // @1 对应 index 0
    if (materialIndex >= 0 && materialIndex < materialCount) {
      metaList.push({
        meta_type: materials[materialIndex].type,
        text: "",
        material_ref: { material_idx: materialIndex }
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加剩余的文本
  if (lastIndex < prompt.length) {
    const remainingText = prompt.substring(lastIndex);
    if (remainingText.trim()) {
      metaList.push({ meta_type: "text", text: remainingText });
    }
  }

  // 如果没有找到任何占位符，默认引用所有素材并附加整个prompt作为文本
  if (metaList.length === 0) {
    // 先添加所有素材引用
    for (let i = 0; i < materialCount; i++) {
      if (i === 0) {
        metaList.push({ meta_type: "text", text: "使用" });
      }
      metaList.push({
        meta_type: materials[i].type,
        text: "",
        material_ref: { material_idx: i }
      });
      if (i < materialCount - 1) {
        metaList.push({ meta_type: "text", text: "和" });
      }
    }
    // 添加描述文本
    if (prompt && prompt.trim()) {
      metaList.push({ meta_type: "text", text: `素材，${prompt}` });
    } else {
      metaList.push({ meta_type: "text", text: "素材生成视频" });
    }
  }

  return metaList;
}