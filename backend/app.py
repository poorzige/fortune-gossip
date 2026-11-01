# -*- coding: utf-8 -*-
"""八卦命盘 后端服务。

API:
  GET  /api/meta                     元信息（问题类别、LLM 状态、服务商预设）
  POST /api/chart/liuyao             六爻排盘 {lines:[6/7/8/9]*6, time?, question?, category?}
  POST /api/chart/meihua             梅花排盘 {mode:'time'|'number', n1?, n2?, time?, question?, category?}
  GET  /api/history                  历史列表
  GET  /api/history/<id>             历史详情
  DELETE /api/history/<id>           删除记录
  POST /api/interpret/llm            大模型解读（流式）{record_id}
  GET  /api/llm/config               读取（脱敏的）模型配置
  POST /api/llm/config               保存模型配置（写入 config.json）
  POST /api/llm/test                 用表单值试连一次
  GET  /api/llm/models               拉取模型列表（?base_url=）
  GET  /api/healthz                  健康检查（部署平台用）

环境变量：
  PORT / HOST                        监听端口与地址（部署平台会自动注入 PORT）
  PUBLIC_MODE=1                      公开部署模式：锁定模型配置接口 + 启用 AI 限流
  AI_RATE_LIMIT / AI_RATE_WINDOW     每个 IP 在窗口秒数内可调用 AI 的次数（默认 5 / 600）
  LLM_BASE_URL / LLM_API_KEY / LLM_MODEL   覆盖 config.json 里的模型配置

运行：python app.py  （默认 http://127.0.0.1:8000）
"""
import os
import threading
import time
from datetime import datetime

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

from core import db, llm
from core.constants import CATEGORIES
from core.liuyao import paipan as liuyao_paipan
from core.meihua import paipan as meihua_paipan

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "frontend")

# 公开部署：访客不能改模型配置（否则会把服务端当代理用，也能刷站长的额度）
PUBLIC_MODE = os.environ.get("PUBLIC_MODE", "").strip().lower() in ("1", "true", "yes", "on")
AI_RATE_LIMIT = int(os.environ.get("AI_RATE_LIMIT", "5") or 0)
AI_RATE_WINDOW = int(os.environ.get("AI_RATE_WINDOW", "600") or 600)

app = Flask(__name__, static_folder=None)
CORS(app)  # 前后端分离：允许本地其他端口/静态服务跨域调用

db.init_db()


# ---------------- 工具 ----------------

def _parse_time(body):
    t = body.get("time")
    if not t:
        return datetime.now()
    try:
        return datetime.fromisoformat(str(t).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return datetime.now()


def _bad_request(msg):
    return jsonify({"error": msg}), 400


_rate_lock = threading.Lock()
_rate_hits = {}


def _client_ip():
    """部署平台前面有反向代理，真实 IP 在 X-Forwarded-For 的第一段。"""
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited():
    """简单的内存滑动窗口限流，只用于保护站长的模型额度。"""
    if AI_RATE_LIMIT <= 0:
        return False
    now = time.time()
    ip = _client_ip()
    with _rate_lock:
        hits = [t for t in _rate_hits.get(ip, []) if now - t < AI_RATE_WINDOW]
        if len(hits) >= AI_RATE_LIMIT:
            _rate_hits[ip] = hits
            return True
        hits.append(now)
        _rate_hits[ip] = hits
        if len(_rate_hits) > 5000:  # 顺手清理过期记录，避免长跑进程内存膨胀
            for key in [k for k, v in _rate_hits.items()
                        if not v or now - v[-1] > AI_RATE_WINDOW]:
                _rate_hits.pop(key, None)
    return False


# ---------------- API ----------------

@app.get("/api/healthz")
def healthz():
    return jsonify({"ok": True, "public": PUBLIC_MODE})


@app.get("/api/meta")
def meta():
    conf = llm.public_config()
    conf["locked"] = PUBLIC_MODE
    return jsonify({
        "categories": [{"key": k, "label": v["label"], "yongshen": v["yongshen"]}
                       for k, v in CATEGORIES.items()],
        "llm": conf,
        "providers": llm.PROVIDERS if not PUBLIC_MODE else [],
    })


# ---------------- 模型接入（配置读写 / 测试 / 模型列表） ----------------

def _locked_response():
    return jsonify({"error": "公开部署已锁定模型配置：请在你自己的机器上修改 config.json，"
                             "或用环境变量 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 配置"}), 403


@app.get("/api/llm/config")
def llm_config_get():
    conf = llm.public_config()
    conf["locked"] = PUBLIC_MODE
    return jsonify({"config": conf,
                    "providers": [] if PUBLIC_MODE else llm.PROVIDERS})


@app.post("/api/llm/config")
def llm_config_set():
    if PUBLIC_MODE:
        return _locked_response()
    body = request.get_json(silent=True) or {}
    try:
        llm.save_config(body)
    except ValueError as e:
        return _bad_request(str(e))
    except OSError as e:
        return jsonify({"error": f"配置写入失败：{e}"}), 500
    return jsonify({"ok": True, "config": llm.public_config()})


@app.post("/api/llm/test")
def llm_test():
    if PUBLIC_MODE:
        return _locked_response()
    body = request.get_json(silent=True) or {}
    return jsonify(llm.test_connection(body))


@app.get("/api/llm/models")
def llm_models():
    if PUBLIC_MODE:
        return _locked_response()
    try:
        ids = llm.fetch_models(request.args.get("base_url"),
                               request.args.get("api_key"))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"models": ids})


@app.post("/api/chart/liuyao")
def chart_liuyao():
    body = request.get_json(silent=True) or {}
    lines = body.get("lines")
    if not isinstance(lines, list) or len(lines) != 6 or \
            any(not isinstance(v, int) or v not in (6, 7, 8, 9) for v in lines):
        return _bad_request("lines 须为 6/7/8/9 组成的六元数组（自下而上）")
    try:
        plate = liuyao_paipan(lines, _parse_time(body),
                              question=str(body.get("question") or "")[:200],
                              category=body.get("category") or "zonghe")
    except Exception as e:  # noqa: BLE001
        return _bad_request(f"排盘失败：{e}")
    rid = db.save_record(plate)
    return jsonify({"record_id": rid, "plate": plate})


@app.post("/api/chart/meihua")
def chart_meihua():
    body = request.get_json(silent=True) or {}
    mode = body.get("mode", "time")
    n1 = body.get("n1")
    n2 = body.get("n2")
    if mode == "number":
        try:
            n1, n2 = int(n1), int(n2)
        except (TypeError, ValueError):
            return _bad_request("数字起卦须提供两个正整数 n1、n2")
        if n1 <= 0 or n2 <= 0 or n1 > 10**9 or n2 > 10**9:
            return _bad_request("数字须为不超过十亿的正整数")
    elif mode != "time":
        return _bad_request("mode 须为 time 或 number")
    try:
        plate = meihua_paipan(_parse_time(body),
                              question=str(body.get("question") or "")[:200],
                              category=body.get("category") or "zonghe",
                              mode=mode, n1=n1, n2=n2)
    except Exception as e:  # noqa: BLE001
        return _bad_request(f"排盘失败：{e}")
    rid = db.save_record(plate)
    return jsonify({"record_id": rid, "plate": plate})


@app.get("/api/history")
def history_list():
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
        offset = max(int(request.args.get("offset", 0)), 0)
    except ValueError:
        return _bad_request("limit/offset 须为整数")
    return jsonify({"records": db.list_records(limit, offset)})


@app.get("/api/history/<int:rid>")
def history_detail(rid):
    rec = db.get_record(rid)
    if rec is None:
        return jsonify({"error": "记录不存在"}), 404
    return jsonify(rec)


@app.delete("/api/history/<int:rid>")
def history_delete(rid):
    if not db.delete_record(rid):
        return jsonify({"error": "记录不存在"}), 404
    return jsonify({"ok": True})


@app.post("/api/interpret/llm")
def interpret_llm():
    body = request.get_json(silent=True) or {}
    rid = body.get("record_id")
    if not isinstance(rid, int):
        return _bad_request("须提供 record_id")
    rec = db.get_record(rid)
    if rec is None:
        return jsonify({"error": "记录不存在"}), 404
    if not llm.is_configured():
        msg = ("本站未开启 AI 解卦" if PUBLIC_MODE else
               "尚未接入大模型：点击页面右上角「模型接入」填写接口地址与 API Key")
        return jsonify({"error": msg}), 503

    if PUBLIC_MODE and _rate_limited():
        return jsonify({
            "error": f"AI 解卦调用过于频繁，每个 IP {AI_RATE_WINDOW // 60} 分钟内"
                     f"最多 {AI_RATE_LIMIT} 次，请稍后再试"
        }), 429

    messages = llm.build_messages(rec["payload"])

    def generate():
        """流式转发；连接被重置等故障时，若尚未输出正文则自动重试。

        思维链进度标记（\x01T 字数）原样转发给前端，但不计入存库正文。
        """
        chunks = []
        last_error = None
        for attempt in range(3):
            try:
                for text in llm.stream_chat(messages):
                    if text.startswith(llm.THINK_MARK):
                        yield text
                        continue
                    chunks.append(text)
                    yield text
                db.update_llm_text(rid, "".join(chunks))
                return
            except Exception as e:  # noqa: BLE001
                last_error = e
                if chunks:
                    # 已输出过正文，无法重试，只能中断
                    err = f"\n\n（解读中断：{e}）"
                    chunks.append(err)
                    yield err
                    db.update_llm_text(rid, "".join(chunks))
                    return
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
        msg = str(last_error)
        if len(msg) > 120:
            msg = msg[:120] + "……"
        err = f"（解读失败：{msg}。已自动重试 3 次，请稍后再试）"
        chunks.append(err)
        yield err
        db.update_llm_text(rid, "")

    return Response(generate(), mimetype="text/plain; charset=utf-8")


# ---------------- 前端静态服务（开发亦可另行静态托管） ----------------

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path):
    full = os.path.normpath(os.path.join(FRONTEND_DIR, path))
    if not full.startswith(os.path.normpath(FRONTEND_DIR)):
        return jsonify({"error": "not found"}), 404
    if not os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, "index.html")
    return send_from_directory(FRONTEND_DIR, path)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="八卦命盘后端服务")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    args = parser.parse_args()

    print(f"* 八卦命盘服务已启动: http://{args.host}:{args.port}")
    if PUBLIC_MODE:
        print("* 公开部署模式：模型配置接口已锁定，AI 每 IP %d 秒内限 %d 次"
              % (AI_RATE_WINDOW, AI_RATE_LIMIT))
    if not llm.is_configured():
        print("* 提示: 尚未接入大模型，可在页面右上角「模型接入」中填写接口地址与 API Key")
        print("*       （规则解读不受影响；配置会保存到 backend/config.json）")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)
