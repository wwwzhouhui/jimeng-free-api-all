#!/bin/bash
# Seedance 2.0 多类型素材（图片+音频）测试脚本
# 用法: bash test-seedance-media.sh [sessionid]

TOKEN="${1:-99999}"
BASE_URL="http://localhost:8000"
IMAGE_FILE="/mnt/f/tmp/2026年2月20日/11.png"
AUDIO_FILE="/mnt/f/tmp/2026年2月20日/22.wav"

echo "=========================================="
echo " Seedance 2.0 多类型素材测试"
echo "=========================================="
echo ""

# 测试1: 健康检查
echo "[测试1] 健康检查 /ping"
echo "------------------------------------------"
curl -s "${BASE_URL}/ping"
echo ""
echo ""

# 测试2: 仅图片（回归测试，验证原有功能不受影响）
echo "[测试2] 仅图片上传（回归测试）"
echo "------------------------------------------"
echo "POST /v1/videos/generations"
echo "  model=seedance-2.0-fast"
echo "  files=11.png (image)"
echo ""
curl -v -X POST "${BASE_URL}/v1/videos/generations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "model=seedance-2.0" \
  -F "prompt=图片中的场景开始动起来" \
  -F "ratio=9:16" \
  -F "duration=4" \
  -F "files=@${IMAGE_FILE}" \
  2>&1
echo ""
echo ""

# 测试3: 图片+音频混合上传
echo "[测试3] 图片+音频混合上传"
echo "------------------------------------------"
echo "POST /v1/videos/generations"
echo "  model=seedance-2.0-fast"
echo "  files=11.png (image) + 22.wav (audio)"
echo ""
curl -v -X POST "${BASE_URL}/v1/videos/generations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "model=seedance-2.0-fast" \
  -F "prompt=@1 图片中的人物随着音乐 @2 开始跳舞" \
  -F "ratio=9:16" \
  -F "duration=5" \
  -F "files=@${IMAGE_FILE}" \
  -F "files=@${AUDIO_FILE}" \
  2>&1
echo ""
echo ""

# 测试4: seedance-2.0-fast 图片+音频
echo "[测试4] seedance-2.0-fast 图片+音频"
echo "------------------------------------------"
echo "POST /v1/videos/generations"
echo "  model=seedance-2.0-fast"
echo "  files=11.png (image) + 22.wav (audio)"
echo ""
curl -v -X POST "${BASE_URL}/v1/videos/generations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "model=seedance-2.0-fast" \
  -F "prompt=@1 配合 @2 的音乐节奏动起来" \
  -F "ratio=4:3" \
  -F "duration=5" \
  -F "files=@${IMAGE_FILE}" \
  -F "files=@${AUDIO_FILE}" \
  2>&1
echo ""
echo ""

# 测试5: 仅音频（无图片）
echo "[测试5] 仅音频上传（预期：音频上传暂未实现的错误）"
echo "------------------------------------------"
curl -v -X POST "${BASE_URL}/v1/videos/generations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "model=seedance-2.0-fast" \
  -F "prompt=根据音乐生成舞蹈视频" \
  -F "ratio=9:16" \
  -F "duration=4" \
  -F "files=@${AUDIO_FILE}" \
  2>&1
echo ""
echo ""

echo "=========================================="
echo " 测试完成"
echo "=========================================="
