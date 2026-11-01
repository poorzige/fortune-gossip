# -*- coding: utf-8 -*-
"""LLM 解读：任意 OpenAI 兼容接口（DeepSeek / GLM / Kimi / 通义 / OpenAI / 本地 Ollama …）。

配置来源优先级：环境变量 > backend/config.json > 内置默认值。
config.json 既可以直接手改，也可以由前端「模型接入」面板通过 API 写入。

对外能力：
  load_config()            读取生效配置
  public_config()          脱敏后的配置（给前端展示）
  save_config(patch)       保存配置（原子写入）
  test_connection(patch)   用未保存的表单值试连一次
  fetch_models(...)        拉取 /models 模型列表
  stream_chat(messages)    SSE 流式对话
"""
import json
import os
import re
import time

import requests

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(_BACKEND_DIR, "config.json")

DEFAULTS = {
    "base_url": "https://integrate.api.nvidia.com/v1",
    "api_key": "",
    "model": "z-ai/glm-5.3-flash",
    "temperature": 0.7,
    # 思考型模型思维链与正文共享 max_tokens，需给足余量
    "max_tokens": 8192,
    # 仅对 NVIDIA NIM 生效：尝试携带关闭思维链的参数
    "disable_thinking": True,
}

CONF_KEYS = ("base_url", "api_key", "model", "temperature", "max_tokens", "disable_thinking")

# 前端「模型接入」面板的快捷预设
PROVIDERS = [
    {"id": "deepseek", "name": "DeepSeek", "base_url": "https://api.deepseek.com/v1",
     "model": "deepseek-chat", "note": "国内直连，响应快，推荐"},
    {"id": "zhipu", "name": "智谱 GLM", "base_url": "https://open.bigmodel.cn/api/paas/v4",
     "model": "glm-4-flash", "note": "有免费额度，速度快"},
    {"id": "moonshot", "name": "Kimi", "base_url": "https://api.moonshot.cn/v1",
     "model": "moonshot-v1-8k", "note": "长文本友好"},
    {"id": "qwen", "name": "通义千问", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
     "model": "qwen-plus", "note": "阿里云百炼"},
    {"id": "openai", "name": "OpenAI", "base_url": "https://api.openai.com/v1",
     "model": "gpt-4o-mini", "note": "需可访问的网络"},
    {"id": "nvidia", "name": "NVIDIA NIM", "base_url": "https://integrate.api.nvidia.com/v1",
     "model": "z-ai/glm-5.3-flash", "note": "免费但排队较久（可能数分钟）"},
    {"id": "ollama", "name": "本地 Ollama", "base_url": "http://127.0.0.1:11434/v1",
     "model": "qwen2.5:7b", "note": "本地部署，无需 Key"},
    {"id": "custom", "name": "自定义", "base_url": "", "model": "", "note": "任意 OpenAI 兼容接口"},
]

SYSTEM_PROMPT = (
    "你是一位精通《周易》经传、六爻纳甲与梅花易数的易学研究者。"
    "用户会给你一卦的完整排盘信息（含纳甲六亲六神世应、体用生克等）以及一个规则引擎的初步分析。"
    "你的任务是给出专业、有理有据的解读：\n"
    "0. 思考过程尽量简短，尽快开始输出正文；\n"
    "1. 结合卦辞爻辞与排盘中的生克关系展开分析，解释为什么得出该趋势；\n"
    "2. 使用 Markdown，按「### 卦象总览」「### 事态推演」「### 趋势判断」「### 行事建议」四节输出；\n"
    "3. 全文不超过 800 字，语气客观理性，用「倾向」「有利」「不利」等表述，不做绝对化断语；\n"
    "4. 涉及健康、投资、法律等问题时只作卦理层面的趋势分析，提醒用户咨询专业人士；\n"
    "5. 结尾加一句简短说明：此解读基于传统易学理论，仅供参考。\n"
    "6. 全部使用简体中文，不要输出与解读无关的客套话。"
)


# ---------------- 配置读写 ----------------

def normalize_base_url(url):
    """把用户填的地址整理成可拼接 /chat/completions 的形式。

    容忍这些写法：末尾多斜杠、粘贴了完整的 .../chat/completions、漏写 https://
    """
    u = str(url or "").strip()
    if not u:
        return ""
    u = u.rstrip("/")
    for suffix in ("/chat/completions", "/completions"):
        if u.endswith(suffix):
            u = u[: -len(suffix)].rstrip("/")
            break
    if not re.match(r"^https?://", u, re.I):
        u = "https://" + u
    return u


def _is_local(base_url):
    return bool(re.search(r"(127\.0\.0\.1|localhost|\[::1\])", base_url or ""))


def _read_raw():
    if not os.path.exists(CONFIG_PATH):
        return {}
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def load_config():
    """读取生效配置：config.json 为主，环境变量 LLM_BASE_URL/LLM_API_KEY/LLM_MODEL 覆盖。"""
    conf = dict(DEFAULTS)
    user = _read_raw().get("llm")
    if isinstance(user, dict):
        for k in CONF_KEYS:
            if k in user and user[k] is not None:
                conf[k] = user[k]
    env_map = {"LLM_BASE_URL": "base_url", "LLM_API_KEY": "api_key", "LLM_MODEL": "model"}
    for env, key in env_map.items():
        if os.environ.get(env):
            conf[key] = os.environ[env]
    conf["base_url"] = normalize_base_url(conf["base_url"]) or DEFAULTS["base_url"]
    conf["model"] = str(conf["model"] or "").strip()
    conf["api_key"] = str(conf["api_key"] or "").strip()
    return conf


def _mask(key):
    if not key:
        return ""
    if len(key) <= 8:
        return key[:1] + "*" * (len(key) - 1)
    return f"{key[:4]}{'*' * 6}{key[-4:]}"


def detect_provider(base_url):
    u = (base_url or "").lower()
    table = [
        ("deepseek.com", "DeepSeek"),
        ("bigmodel.cn", "智谱 GLM"),
        ("moonshot.cn", "Kimi"),
        ("dashscope.aliyuncs.com", "通义千问"),
        ("openai.com", "OpenAI"),
        ("nvidia.com", "NVIDIA NIM"),
        ("groq.com", "Groq"),
        ("siliconflow.cn", "硅基流动"),
        ("openrouter.ai", "OpenRouter"),
        ("localhost", "本地模型"),
        ("127.0.0.1", "本地模型"),
    ]
    for host, name in table:
        if host in u:
            return name
    return "自定义接口"


def public_config():
    """给前端看的配置：密钥脱敏，不返回明文。"""
    conf = load_config()
    configured = bool(conf["api_key"]) or _is_local(conf["base_url"])
    return {
        "configured": configured,
        "base_url": conf["base_url"],
        "model": conf["model"],
        "temperature": conf["temperature"],
        "max_tokens": conf["max_tokens"],
        "disable_thinking": bool(conf.get("disable_thinking")),
        "has_key": bool(conf["api_key"]),
        "api_key_masked": _mask(conf["api_key"]),
        "provider": detect_provider(conf["base_url"]),
        "env_override": bool(os.environ.get("LLM_API_KEY") or os.environ.get("LLM_BASE_URL")),
    }


def is_configured():
    conf = load_config()
    return bool(conf["api_key"]) or _is_local(conf["base_url"])


def save_config(patch):
    """把前端表单写进 config.json。

    - api_key 传空字符串表示「不修改」，要清空请传 clear_key=true；
    - 保留文件里其它未知字段（如 _备注），只覆盖 llm 下已知项。
    """
    if not isinstance(patch, dict):
        raise ValueError("请求体须为 JSON 对象")
    raw = _read_raw()
    current = raw.get("llm") if isinstance(raw.get("llm"), dict) else {}
    merged = {**DEFAULTS, **current}

    for key in ("base_url", "model"):
        if key in patch:
            val = str(patch.get(key) or "").strip()
            if key == "base_url":
                val = normalize_base_url(val)
            if not val:
                raise ValueError("接口地址与模型名称不能为空")
            merged[key] = val

    if "api_key" in patch:
        val = str(patch.get("api_key") or "").strip()
        if val:                      # 空值 = 保持原 Key
            merged["api_key"] = val
    if patch.get("clear_key"):
        merged["api_key"] = ""

    if "temperature" in patch and patch["temperature"] not in (None, ""):
        try:
            merged["temperature"] = round(min(max(float(patch["temperature"]), 0.0), 2.0), 2)
        except (TypeError, ValueError):
            raise ValueError("temperature 须为 0~2 的数字")

    if "max_tokens" in patch and patch["max_tokens"] not in (None, ""):
        try:
            merged["max_tokens"] = int(min(max(int(float(patch["max_tokens"])), 64), 200000))
        except (TypeError, ValueError):
            raise ValueError("max_tokens 须为整数")

    if "disable_thinking" in patch:
        merged["disable_thinking"] = bool(patch["disable_thinking"])

    raw["llm"] = {k: merged[k] for k in CONF_KEYS}
    # 保留原有的说明字段
    for k, v in (current.items() if isinstance(current, dict) else []):
        if k not in CONF_KEYS:
            raw["llm"][k] = v

    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)
    return load_config()


# ---------------- HTTP 细节 ----------------

def _endpoint(base_url, path):
    return normalize_base_url(base_url).rstrip("/") + path


def _headers(conf):
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if conf.get("api_key"):
        headers["Authorization"] = f"Bearer {conf['api_key']}"
    return headers


def _net_opts(base_url):
    """本地地址（Ollama 等）绕过系统代理。

    国内机器常开着 Clash/v2ray，requests 会读取 HTTP_PROXY 环境变量，
    把 127.0.0.1 的请求也丢给代理，导致本地模型连不上。
    """
    if _is_local(base_url):
        return {"proxies": {"http": None, "https": None}}
    return {}


def _post(url, payload, headers, timeout=(15, 300), base_url=None):
    # ensure_ascii=False：默认 JSON 会把每个汉字转 6 字节转义，体积翻倍且更易被中间设备掐断
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return requests.post(url, data=body, headers=headers, stream=True, timeout=timeout,
                         **_net_opts(base_url or url))


def _use_thinking_flag(conf):
    """只有 NVIDIA NIM 网关认识 chat_template_kwargs，其他厂商发了会 400。"""
    return bool(conf.get("disable_thinking")) and "nvidia" in (conf.get("base_url") or "").lower()


def _error_text(status, body):
    hints = {
        400: "请求被拒绝，通常是模型名称与接口不匹配",
        401: "API Key 无效或未授权",
        402: "账户余额不足",
        403: "无权访问该模型（可能未开通）",
        404: "接口地址不存在，检查 Base URL 是否少了 /v1",
        413: "请求体过大",
        429: "请求过于频繁或额度已用尽",
    }
    hint = hints.get(status) or ("服务端错误" if status >= 500 else "接口返回异常")
    detail = re.sub(r"\s+", " ", (body or "").strip())[:280]
    return f"{hint}（HTTP {status}）" + (f"：{detail}" if detail else "")


def _chat_request(conf, messages, stream=True, max_tokens=None, timeout=(15, 300)):
    url = _endpoint(conf["base_url"], "/chat/completions")
    payload = {
        "model": conf["model"],
        "messages": messages,
        "temperature": float(conf.get("temperature", 0.7)),
        "max_tokens": int(max_tokens or conf.get("max_tokens") or 2048),
        "stream": bool(stream),
    }
    if _use_thinking_flag(conf):
        payload["chat_template_kwargs"] = {"thinking": False}
    headers = _headers(conf)

    def send():
        try:
            return _post(url, payload, headers, timeout=timeout, base_url=conf["base_url"])
        except requests.exceptions.Timeout:
            raise RuntimeError("连接模型接口超时，请检查网络或换一个服务商")
        except requests.exceptions.ConnectionError:
            raise RuntimeError(f"无法连接 {conf['base_url']}，请检查地址、端口与网络")

    resp = send()
    if resp.status_code == 400 and "chat_template_kwargs" in payload:
        detail = resp.text[:400]
        resp.close()
        if "chat_template_kwargs" in detail or "thinking" in detail:
            payload.pop("chat_template_kwargs", None)
            resp = send()
    return resp


# ---------------- 连通性测试 / 模型列表 ----------------

def test_connection(patch=None):
    """用（可能尚未保存的）表单值发一次最小请求，返回 {ok, ...} 而非抛异常。"""
    conf = dict(load_config())
    if isinstance(patch, dict):
        if "base_url" in patch and not str(patch.get("base_url") or "").strip():
            return {"ok": False, "error": "请先填写接口地址"}
        if "model" in patch and not str(patch.get("model") or "").strip():
            return {"ok": False, "error": "请先填写模型名称"}
        if str(patch.get("base_url") or "").strip():
            conf["base_url"] = normalize_base_url(patch["base_url"])
        if str(patch.get("api_key") or "").strip():
            conf["api_key"] = str(patch["api_key"]).strip()
        if str(patch.get("model") or "").strip():
            conf["model"] = str(patch["model"]).strip()
        if patch.get("max_tokens"):
            try:
                conf["max_tokens"] = int(patch["max_tokens"])
            except (TypeError, ValueError):
                pass

    if not conf["base_url"]:
        return {"ok": False, "error": "请先填写接口地址"}
    if not conf["model"]:
        return {"ok": False, "error": "请先填写模型名称"}
    if not conf["api_key"] and not _is_local(conf["base_url"]):
        return {"ok": False, "error": "请先填写 API Key"}

    started = time.time()
    try:
        resp = _chat_request(
            conf, [{"role": "user", "content": "只回复两个字：就绪"}],
            stream=False, max_tokens=64, timeout=(12, 60),
        )
        if resp.status_code != 200:
            detail = resp.text[:400]
            resp.close()
            return {"ok": False, "error": _error_text(resp.status_code, detail),
                    "latency_ms": int((time.time() - started) * 1000)}
        data = resp.json()
        resp.close()
        choices = data.get("choices") or []
        msg = (choices[0].get("message") if choices else {}) or {}
        reply = (msg.get("content") or msg.get("reasoning_content") or "").strip()
        return {
            "ok": True,
            "latency_ms": int((time.time() - started) * 1000),
            "model": data.get("model") or conf["model"],
            "reply": reply[:60],
        }
    except requests.exceptions.Timeout:
        return {"ok": False, "error": "连接超时（60 秒），检查网络或接口地址",
                "latency_ms": int((time.time() - started) * 1000)}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "error": f"无法连接 {conf['base_url']}，请检查地址、端口与网络连通性",
                "latency_ms": int((time.time() - started) * 1000)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:220],
                "latency_ms": int((time.time() - started) * 1000)}


def fetch_models(base_url=None, api_key=None):
    """GET {base_url}/models，返回模型 id 列表（部分网关不实现该接口）。"""
    conf = load_config()
    base = normalize_base_url(base_url) or conf["base_url"]
    key = str(api_key or "").strip() or conf["api_key"]
    if not base:
        raise RuntimeError("请先填写接口地址")
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    try:
        resp = requests.get(_endpoint(base, "/models"), headers=headers, timeout=20,
                            **_net_opts(base))
    except requests.exceptions.Timeout:
        raise RuntimeError(f"连接 {base} 超时（20 秒）")
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"无法连接 {base}，请检查地址、端口与网络连通性")
    if resp.status_code != 200:
        raise RuntimeError(_error_text(resp.status_code, resp.text[:200]))
    try:
        data = resp.json()
    except ValueError:
        raise RuntimeError("接口返回的不是 JSON，可能不是 OpenAI 兼容地址")
    items = data.get("data") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise RuntimeError("接口未返回模型列表（该网关可能不支持 /models）")
    ids = sorted({str(it.get("id")) for it in items
                  if isinstance(it, dict) and it.get("id")})
    return ids


# ---------------- Prompt 组装 ----------------

def _liuyao_prompt(plate):
    ti = plate["time_info"]
    rows = plate["rows"]
    # 自下而上存储；给模型看时上爻在前，符合阅读习惯
    labels = "初二三四五上"
    lines = []
    for r in reversed(rows):
        marks = []
        if r["dong"]:
            marks.append("动")
        if r["shi"]:
            marks.append("世")
        if r["ying"]:
            marks.append("应")
        if r["kong"]:
            marks.append("空亡")
        seg = (f"{labels[r['pos'] - 1]}爻 {r['shen']} {r['qin']} {r['gz']}"
               f"（{r['wuxing']}，{r['yue_wang']}）"
               + ("·" + "·".join(marks) if marks else ""))
        if r["fu"]:
            seg += f" 伏神:{r['fu']['qin']}{r['fu']['gz']}"
        if r["bian"]:
            b = r["bian"]
            extra = []
            if b["huisheng"]:
                extra.append("回头生")
            if b["huike"]:
                extra.append("回头克")
            if b["jintui"]:
                extra.append(b["jintui"])
            seg += f" → 化 {b['qin']}{b['gz']}（{b['wuxing']}{'，' + '，'.join(extra) if extra else ''}）"
        lines.append(seg)
    interp = plate["interpretation"]
    factor_lines = "\n".join(f"- {f['name']}（{f['delta']:+d}）：{f['desc']}"
                             for f in interp["factors"]) or "-（无）"
    dong = "、".join(f"{labels[p - 1]}爻" for p in plate["dong_positions"]) or "无（六爻安静）"
    return f"""【占问】{plate['question'] or '（未填写具体问题）'}（类别：{plate['category_label']}——{plate.get('category_hint', '')}）
【起卦时间】{plate['cast_time']}（{ti['lunar']}，{ti['year_gz']}年 {ti['month_gz']}月 {ti['day_gz']}日 {ti['hour_gz']}时，月建{ti['month_jian']}，旬空：{ti['xun_kong']}）
【本卦】{plate['ben']['full_name']}（{plate['ben']['palace_name']}{plate['ben']['palace_element']}之{plate['ben']['palace_guaming']}，世居{labels[plate['ben']['shi'] - 1]}爻，应居{labels[plate['ben']['ying'] - 1]}爻）
【互卦】{plate['hu']['full_name']}
【变卦】{plate['bian']['full_name'] if plate['bian'] else '无（六爻安静）'}
【动爻】{dong}
【卦辞】{plate['ben']['guaci']}
【动爻爻辞】{"；".join(y['label'] + '：' + y['text'] for y in plate['dong_yaoci']) or '无'}
【排盘】（自上而下）
{chr(10).join(lines)}
【规则引擎初判】评分 {interp['score']}/100，结论「{interp['verdict']}」——{interp['verdict_desc']}
主要因素：
{factor_lines}"""


def _meihua_prompt(plate):
    ti = plate["time_info"]
    interp = plate["interpretation"]
    factor_lines = "\n".join(f"- {f['name']}（{f['delta']:+d}）：{f['desc']}"
                             for f in interp["factors"]) or "-（无）"
    return f"""【占问】{plate['question'] or '（未填写具体问题）'}（类别：{plate['category_label']}——{plate.get('category_hint', '')}）
【起卦时间】{plate['cast_time']}（{ti['lunar']}）
【起卦方式】{plate['qigua']['desc']}
【本卦】{plate['ben']['full_name']}（上{plate['ben']['upper']}下{plate['ben']['lower']}）
【互卦】{plate['hu']['full_name']}
【变卦】{plate['bian']['full_name']}
【体用】体卦：{plate['ti']['gua']}（{plate['ti']['wuxing']}，{plate['ti']['position']}）；用卦：{plate['yong']['gua']}（{plate['yong']['wuxing']}，{plate['yong']['position']}）
【卦辞】{plate['ben']['guaci']}
【动爻爻辞】{"；".join(y['label'] + '：' + y['text'] for y in plate['dong_yaoci']) or '无'}
【规则引擎初判】评分 {interp['score']}/100，结论「{interp['verdict']}」——{interp['verdict_desc']}
主要因素：
{factor_lines}"""


def build_messages(plate):
    user = _liuyao_prompt(plate) if plate["method"] == "liuyao" else _meihua_prompt(plate)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user + "\n\n请据此输出四节解读。"},
    ]


# ---------------- 流式对话 ----------------

THINK_MARK = "\x01T"   # 思维链进度标记前缀，后接累计字数


def stream_chat(messages, conf=None):
    """流式对话，返回生成器。产出正文；思维链进度以 "\\x01T<字数>" 标记产出。

    兼容性处理：
    - 响应头常不带 charset，手动按 UTF-8 解码，否则中文乱码；
    - 思考型模型先流 reasoning_content 再流 content，思考进度折算成标记；
    - 连接中途被重置时由调用方（app.py）在「尚未输出正文」前提下重试。
    """
    conf = dict(conf or load_config())
    if not conf["api_key"] and not _is_local(conf["base_url"]):
        raise RuntimeError("未配置 API Key，请在页面「模型接入」中填写")
    if not conf["model"]:
        raise RuntimeError("未配置模型名称，请在页面「模型接入」中填写")

    resp = _chat_request(conf, messages, stream=True)
    if resp.status_code != 200:
        detail = resp.text[:400]
        resp.close()
        raise RuntimeError(_error_text(resp.status_code, detail))
    return _stream_once(resp)


def _stream_once(resp):
    try:
        got_content = False
        think_len = 0
        think_emitted = 0
        for raw in resp.iter_lines():
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace")
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            if isinstance(chunk.get("error"), dict):
                msg = chunk["error"].get("message") or chunk["error"]
                raise RuntimeError(f"模型服务返回错误：{msg}")
            choices = chunk.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            reasoning = delta.get("reasoning_content")
            if reasoning:
                think_len += len(reasoning)
                if think_len - think_emitted >= 300:
                    think_emitted = think_len
                    yield f"{THINK_MARK}{think_len}"
            content = delta.get("content")
            if content:
                got_content = True
                yield content
        if not got_content:
            raise RuntimeError("模型未返回正文内容（思考过程可能耗尽了 token 上限，"
                               "可在「模型接入」中调大 max_tokens 后重试）")
    finally:
        resp.close()
