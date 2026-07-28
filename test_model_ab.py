#!/usr/bin/env python3
"""
转录模型 A/B：whisper-1（现役麦克风主力） vs gpt-4o-mini-transcribe-2025-12-15。

背景见 BACKLOG.md「是否把麦克风路径换成 gpt-4o-mini-transcribe-2025-12-15」。
要回答两个问题：
  1. 中文准确率上新模型有没有真的更好？（当初选 whisper-1 就是为了中文）
  2. 换过去会丢掉 verbose_json 段落级过滤，值不值？

顺带做权限验证：脚本会先用生产实际用到的两个模型各打一次，确认受限 key 还能用。

用法（在你自己的终端跑，key 不进任何对话/日志）：
    export OPENAI_API_KEY='sk-...'
    ./venv/bin/python test_model_ab.py                      # 用仓库自带测试音频
    ./venv/bin/python test_model_ab.py 我的录音.webm ...     # 用你自己的录音（推荐）
    ./venv/bin/python test_model_ab.py --lang zh 录音.webm   # 指定语言

强烈建议用**你自己出过幻觉的真实中文录音**，仓库里那两个测试文件说明不了中文场景。
"""
import os
import sys
import time
import wave
import math
import random
import struct
import tempfile

import requests

# 复用生产的真实过滤逻辑，避免重写导致和线上不一致
from api_fallback import _filter_hallucinated_segments, _scrub_hallucination_phrases

API_URL = "https://api.openai.com/v1/audio/transcriptions"
OLD_MODEL = "whisper-1"
NEW_MODEL = "gpt-4o-mini-transcribe-2025-12-15"
PROD_DIARIZE = "gpt-4o-transcribe-diarize"   # 系统音路径，本次不换，只验权限

KEY = os.environ.get("OPENAI_API_KEY", "").strip()


def _post(path, model, response_format, language=None, extra=None):
    """打一次转录请求，返回 (http_code, json_or_text, 耗时秒)。"""
    data = {"model": model, "response_format": response_format}
    if language:
        data["language"] = language
    if extra:
        data.update(extra)
    with open(path, "rb") as fh:
        files = {"file": (os.path.basename(path), fh.read())}
    t0 = time.time()
    r = requests.post(API_URL, headers={"Authorization": f"Bearer {KEY}"},
                      files=files, data=data, timeout=300)
    dt = time.time() - t0
    try:
        return r.status_code, r.json(), dt
    except Exception:
        return r.status_code, r.text, dt


def make_silence(path, seconds=30, noise_amplitude=0):
    """生成纯静音 / 极低电平噪音 WAV（16kHz 单声道，和线上上传格式一致）。

    纯静音正是"麦克风轨道 muted"的真实复现——v129 那个 '栏目 栏目 栏目' 就是这么来的。
    """
    rate = 16000
    rnd = random.Random(42)          # 固定种子，可复现
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for _ in range(rate * seconds):
            v = int(rnd.gauss(0, noise_amplitude)) if noise_amplitude else 0
            frames += struct.pack("<h", max(-32768, min(32767, v)))
        w.writeframes(bytes(frames))


def show(label, code, payload, dt, model):
    print(f"\n  [{label}] {model}  ({dt:.1f}s)")
    if code != 200:
        body = payload if isinstance(payload, str) else str(payload)
        print(f"    ❌ HTTP {code}: {body[:300]}")
        return None
    text = payload.get("text", "") if isinstance(payload, dict) else str(payload)
    print(f"    原始输出: {text[:300]!r}" if text else "    原始输出: (空)")

    # 文本层过滤（模型无关，两条路径都会经过）
    scrubbed = _scrub_hallucination_phrases(text)
    if scrubbed != text:
        print(f"    ↳ 文本层过滤后: {scrubbed[:300]!r}")

    # 段落层过滤（只有 whisper-1 的 verbose_json 有 segments）
    segs = payload.get("segments") if isinstance(payload, dict) else None
    if segs:
        print(f"    段落数: {len(segs)}")
        for i, s in enumerate(segs[:6]):
            print(f"      seg{i} {s.get('start',0):.1f}-{s.get('end',0):.1f}s "
                  f"no_speech={s.get('no_speech_prob',0):.2f} "
                  f"compr={s.get('compression_ratio',0):.2f} "
                  f"logprob={s.get('avg_logprob',0):.2f} :: {s.get('text','').strip()[:50]!r}")
        try:
            filtered = _filter_hallucinated_segments(segs, log_tag="AB-TEST")
            print(f"    ↳ 段落层过滤后: {filtered[:300]!r}")
        except Exception as e:
            print(f"    ↳ 段落层过滤: 全部判为幻觉 → 抛异常走 fallback（{e}）")
    else:
        print("    段落数: 无 —— ⚠️ 该模型不返回 segments，v122 段落级过滤对它完全失效")
    return text


def main():
    if not KEY:
        sys.exit("❌ 请先 export OPENAI_API_KEY='sk-...'")

    args = [a for a in sys.argv[1:]]
    language = None
    if "--lang" in args:
        i = args.index("--lang")
        language = args[i + 1]
        del args[i:i + 2]
    audios = args or ["test_voice.mp3"]

    missing = [a for a in audios if not os.path.exists(a)]
    if missing:
        sys.exit(f"❌ 找不到音频: {missing}")

    # ── 0. 权限验证：生产实际用的两个模型 ──────────────────────────────
    print("=" * 72)
    print("0. 受限 key 权限验证（生产实际调用的两个模型）")
    print("=" * 72)
    probe = audios[0]
    ok = True
    for model, fmt, extra in [
        (OLD_MODEL, "verbose_json", None),
        (PROD_DIARIZE, "diarized_json", {"chunking_strategy": "auto"}),
    ]:
        code, payload, dt = _post(probe, model, fmt, language, extra)
        if code == 200:
            print(f"  ✅ {model:32s} HTTP 200  ({dt:.1f}s)")
        else:
            ok = False
            body = payload if isinstance(payload, str) else str(payload)
            print(f"  ❌ {model:32s} HTTP {code}: {body[:200]}")
    if not ok:
        print("\n  ⚠️ 生产路径已经打不通 —— 受限 key 的 scope 给窄了，先去 OpenAI 后台放开"
              "\n     Model capabilities（父级）设为 Request，再回来重跑。")
        return
    print("\n  → 受限 key 对生产两条路径都有效。")

    # ── 1. 真实音频 A/B ────────────────────────────────────────────────
    print("\n" + "=" * 72)
    print("1. 真实音频 A/B：现役 whisper-1  vs  候选 gpt-4o-mini-transcribe")
    print("=" * 72)
    for path in audios:
        print(f"\n▶ {path}  ({os.path.getsize(path)//1024} KB)")
        show("现役", *_post(path, OLD_MODEL, "verbose_json", language), model=OLD_MODEL)
        show("候选", *_post(path, NEW_MODEL, "json", language), model=NEW_MODEL)

    # ── 2. 幻觉压力测试：静音 / 极低噪音 ───────────────────────────────
    print("\n" + "=" * 72)
    print("2. 幻觉压力测试（这是决定性的一项）")
    print("   纯静音 = 麦克风轨道 muted 的真实复现，v129 的 '栏目 栏目 栏目' 就是这么来的。")
    print("   期望：输出为空。任何成句文字都是幻觉。")
    print("=" * 72)
    tmpdir = tempfile.mkdtemp()
    for label, amp in [("纯静音 30s", 0), ("极低噪音 30s", 60)]:
        wav = os.path.join(tmpdir, f"silence_{amp}.wav")
        make_silence(wav, seconds=30, noise_amplitude=amp)
        print(f"\n▶ {label}")
        show("现役", *_post(wav, OLD_MODEL, "verbose_json", language), model=OLD_MODEL)
        show("候选", *_post(wav, NEW_MODEL, "json", language), model=NEW_MODEL)

    print("\n" + "=" * 72)
    print("怎么读这份结果：")
    print("  · 中文准确率——候选明显更好才值得换（厂商自述不算数，看你自己的录音）")
    print("  · 幻觉压力测试——候选在静音下更干净，才抵得上丢掉段落级过滤的代价")
    print("  · 候选没有 segments：换过去后 v122 的段落层过滤直接失效，只剩文本层")
    print("  · 结论写回 BACKLOG.md / DECISION_LOG.md（铁律 #2）")
    print("=" * 72)


if __name__ == "__main__":
    main()
