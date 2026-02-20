#!/usr/bin/env python3
"""Seedance 2.0 测试3: 图片+音频混合上传"""

import sys
import requests

TOKEN = sys.argv[1] if len(sys.argv) > 1 else "99999"
BASE_URL = "http://localhost:8000"
IMAGE_FILE = "/mnt/f/tmp/2026年2月20日/11.png"
AUDIO_FILE = "/mnt/f/tmp/2026年2月20日/22.wav"

print("=" * 42)
print(" [测试3] 图片+音频混合上传")
print("=" * 42)
print(f"POST {BASE_URL}/v1/videos/generations")
print(f"  model=seedance-2.0-fast")
print(f"  files=11.png (image) + 22.wav (audio)")
print()

resp = requests.post(
    f"{BASE_URL}/v1/videos/generations",
    headers={"Authorization": f"Bearer {TOKEN}"},
    data={
        "model": "seedance-2.0-fast",
        "prompt": "@1 图片中的人物随着音乐 @2 开始跳舞",
        "ratio": "9:16",
        "duration": "5",
    },
    files=[
        ("files", ("11.png", open(IMAGE_FILE, "rb"), "image/png")),
        ("files", ("22.wav", open(AUDIO_FILE, "rb"), "audio/wav")),
    ],
)

print(f"HTTP {resp.status_code}")
print()

if resp.status_code == 200:
    result = resp.json()
    print(f"created: {result.get('created', '')}")
    data = result.get("data", [])
    if data:
        for i, item in enumerate(data):
            url = item.get("url", "")
            prompt = item.get("revised_prompt", "")
            print(f"revised_prompt: {prompt}")
            print()
            print(f"Video URL:")
            print(url)
    else:
        print("data 为空，未生成视频")
        print(f"原始响应: {resp.text}")
else:
    print(f"请求失败:")
    print(resp.text)
