/* 静态版"后端"：全部在浏览器里完成。
 * 排盘/断卦走本地 engine，历史存 localStorage，AI 由浏览器直连服务商。
 * 对 app.js 暴露与 Flask 版一致的 api() 语义，UI 代码不用改。 */

import { setTexts, paipanLiuyao, paipanMeihua, CATEGORIES } from "./engine/index.js";

/* ---------------- 服务商预设（与 backend/core/llm.py 一致） ---------------- */

const PROVIDERS = [
  { id: "deepseek", name: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", note: "国内直连，响应快，推荐" },
  { id: "moonshot", name: "Kimi", base_url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", note: "长文本友好" },
  { id: "qwen", name: "通义千问", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", note: "阿里云百炼（浏览器直连需跨域许可）" },
  { id: "zhipu", name: "智谱 GLM", base_url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", note: "有免费额度（浏览器直连需跨域许可）" },
  { id: "openai", name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini", note: "需可访问的网络" },
  { id: "nvidia", name: "NVIDIA NIM", base_url: "https://integrate.api.nvidia.com/v1", model: "z-ai/glm-5.3-flash", note: "免费但排队较久" },
  { id: "ollama", name: "本地 Ollama", base_url: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b", note: "本地部署，需允许跨域来源" },
  { id: "custom", name: "自定义", base_url: "", model: "", note: "任意 OpenAI 兼容接口" },
];

const CATEGORY_LIST = Object.entries(CATEGORIES).map(([key, v]) => ({
  key, label: v.label, yongshen: v.yongshen,
}));

/* ---------------- 卦爻辞数据 ---------------- */

let readyPromise = null;

function ready() {
  if (!readyPromise) {
    readyPromise = fetch("data/hexagram_texts.json")
      .then((r) => {
        if (!r.ok) throw new Error("卦爻辞数据加载失败");
        return r.json();
      })
      .then((texts) => { setTexts(texts); });
  }
  return readyPromise;
}

/* ---------------- 历史（localStorage） ---------------- */

const HISTORY_KEY = "bagua.history.v1";
const HISTORY_MAX = 60;
const LLM_STORE = "bagua.byok";

function readStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 隐私模式或配额满：静默失败，不影响排盘 */
  }
}

function allRecords() {
  const v = readStore(HISTORY_KEY, []);
  return Array.isArray(v) ? v : [];
}

const pad2 = (n) => String(n).padStart(2, "0");

function nowText() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} `
    + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function saveRecord(plate) {
  const list = allRecords();
  const id = list.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  list.push({
    id,
    created_at: nowText(),
    method: plate.method,
    question: plate.question || "",
    category: plate.category || "",
    hexagram_name: plate.ben.full_name,
    verdict: plate.interpretation?.verdict || "",
    score: plate.interpretation?.score ?? null,
    payload: plate,
    llm_text: "",
  });
  list.sort((a, b) => a.id - b.id);
  writeStore(HISTORY_KEY, list.slice(-HISTORY_MAX));
  return id;
}

function listRecords() {
  return allRecords().slice().reverse().map((r) => ({
    id: r.id,
    created_at: r.created_at,
    method: r.method,
    question: r.question,
    category: r.category,
    hexagram_name: r.hexagram_name,
    verdict: r.verdict,
    score: r.score,
    has_llm: !!(r.llm_text && r.llm_text.length),
  }));
}

function getRecord(id) {
  return allRecords().find((r) => r.id === Number(id)) || null;
}

function deleteRecord(id) {
  const list = allRecords().filter((r) => r.id !== Number(id));
  writeStore(HISTORY_KEY, list);
  return true;
}

function updateLlmText(id, text) {
  const list = allRecords();
  const rec = list.find((r) => r.id === Number(id));
  if (!rec) return;
  rec.llm_text = text;
  writeStore(HISTORY_KEY, list);
}

/* ---------------- AI：提示词 ---------------- */

const SYSTEM_PROMPT = "你是一位精通《周易》经传、六爻纳甲与梅花易数的易学研究者。"
  + "用户会给你一卦的完整排盘信息（含纳甲六亲六神世应、体用生克等）以及一个规则引擎的初步分析。"
  + "你的任务是给出专业、有理有据的解读：\n"
  + "0. 思考过程尽量简短，尽快开始输出正文；\n"
  + "1. 结合卦辞爻辞与排盘中的生克关系展开分析，解释为什么得出该趋势；\n"
  + "2. 使用 Markdown，按「### 卦象总览」「### 事态推演」「### 趋势判断」「### 行事建议」四节输出；\n"
  + "3. 全文不超过 800 字，语气客观理性，用「倾向」「有利」「不利」等表述，不做绝对化断语；\n"
  + "4. 涉及健康、投资、法律等问题时只作卦理层面的趋势分析，提醒用户咨询专业人士；\n"
  + "5. 结尾加一句简短说明：此解读基于传统易学理论，仅供参考。\n"
  + "6. 全部使用简体中文，不要输出与解读无关的客套话。";

const YAO_LABELS = "初二三四五上";

function liuyaoPrompt(plate) {
  const ti = plate.time_info;
  const segs = [];
  [...plate.rows].reverse().forEach((r) => {
    const marks = [];
    if (r.dong) marks.push("动");
    if (r.shi) marks.push("世");
    if (r.ying) marks.push("应");
    if (r.kong) marks.push("空亡");
    let seg = `${YAO_LABELS[r.pos - 1]}爻 ${r.shen} ${r.qin} ${r.gz}（${r.wuxing}，${r.yue_wang}）`
      + (marks.length ? `·${marks.join("·")}` : "");
    if (r.fu) seg += ` 伏神:${r.fu.qin}${r.fu.gz}`;
    if (r.bian) {
      const b = r.bian;
      const extra = [];
      if (b.huisheng) extra.push("回头生");
      if (b.huike) extra.push("回头克");
      if (b.jintui) extra.push(b.jintui);
      seg += ` → 化 ${b.qin}${b.gz}（${b.wuxing}${extra.length ? `，${extra.join("，")}` : ""}）`;
    }
    segs.push(seg);
  });
  const interp = plate.interpretation;
  const factorLines = interp.factors
    .map((f) => `- ${f.name}（${f.delta >= 0 ? "+" : ""}${f.delta}）：${f.desc}`)
    .join("\n") || "-（无）";
  const dong = plate.dong_positions.map((p) => `${YAO_LABELS[p - 1]}爻`).join("、")
    || "无（六爻安静）";
  return `【占问】${plate.question || "（未填写具体问题）"}（类别：${plate.category_label}——${plate.category_hint || ""}）
【起卦时间】${plate.cast_time}（${ti.lunar}，${ti.year_gz}年 ${ti.month_gz}月 ${ti.day_gz}日 ${ti.hour_gz}时，月建${ti.month_jian}，旬空：${ti.xun_kong}）
【本卦】${plate.ben.full_name}（${plate.ben.palace_name}${plate.ben.palace_element}之${plate.ben.palace_guaming}，世居${YAO_LABELS[plate.ben.shi - 1]}爻，应居${YAO_LABELS[plate.ben.ying - 1]}爻）
【互卦】${plate.hu.full_name}
【变卦】${plate.bian ? plate.bian.full_name : "无（六爻安静）"}
【动爻】${dong}
【卦辞】${plate.ben.guaci}
【动爻爻辞】${plate.dong_yaoci.map((y) => `${y.label}：${y.text}`).join("；") || "无"}
【排盘】（自上而下）
${segs.join("\n")}
【规则引擎初判】评分 ${interp.score}/100，结论「${interp.verdict}」——${interp.verdict_desc}
主要因素：
${factorLines}`;
}

function meihuaPrompt(plate) {
  const ti = plate.time_info;
  const interp = plate.interpretation;
  const factorLines = interp.factors
    .map((f) => `- ${f.name}（${f.delta >= 0 ? "+" : ""}${f.delta}）：${f.desc}`)
    .join("\n") || "-（无）";
  return `【占问】${plate.question || "（未填写具体问题）"}（类别：${plate.category_label}——${plate.category_hint || ""}）
【起卦时间】${plate.cast_time}（${ti.lunar}）
【起卦方式】${plate.qigua.desc}
【本卦】${plate.ben.full_name}（上${plate.ben.upper}下${plate.ben.lower}）
【互卦】${plate.hu.full_name}
【变卦】${plate.bian.full_name}
【体用】体卦：${plate.ti.gua}（${plate.ti.wuxing}，${plate.ti.position}）；用卦：${plate.yong.gua}（${plate.yong.wuxing}，${plate.yong.position}）
【卦辞】${plate.ben.guaci}
【动爻爻辞】${plate.dong_yaoci.map((y) => `${y.label}：${y.text}`).join("；") || "无"}
【规则引擎初判】评分 ${interp.score}/100，结论「${interp.verdict}」——${interp.verdict_desc}
主要因素：
${factorLines}`;
}

function buildMessages(plate) {
  const user = plate.method === "liuyao" ? liuyaoPrompt(plate) : meihuaPrompt(plate);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${user}\n\n请据此输出四节解读。` },
  ];
}

/* ---------------- AI：网络层 ---------------- */

function normalizeBase(u) {
  let s = String(u || "").trim().replace(/\/+$/, "");
  for (const suffix of ["/chat/completions", "/completions"]) {
    if (s.endsWith(suffix)) {
      s = s.slice(0, -suffix.length).replace(/\/+$/, "");
      break;
    }
  }
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

const endpoint = (base) => `${normalizeBase(base)}/chat/completions`;

function errorText(status, detail) {
  const d = String(detail || "");
  if (status === 401 || status === 403) return "API Key 无效或被拒绝（401/403）";
  if (status === 404) return "接口地址不对（404）：检查 Base URL 是否要带 /v1";
  if (status === 429) return "请求过于频繁或额度用尽（429）";
  if (status >= 500) return `服务商返回 ${status}，稍后再试`;
  return `请求失败（${status}）：${d.slice(0, 160)}`;
}

const BYOK = () => readStore(LLM_STORE, null);
const saved = () => BYOK();

async function testConnection(conf) {
  const started = performance.now();
  try {
    const resp = await fetch(endpoint(conf.base_url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(conf.api_key ? { Authorization: `Bearer ${conf.api_key}` } : {}),
      },
      body: JSON.stringify({
        model: conf.model,
        messages: [{ role: "user", content: "只回复两个字：就绪" }],
        max_tokens: 64,
        stream: false,
      }),
    });
    const latency = Math.round(performance.now() - started);
    if (!resp.ok) {
      return { ok: false, error: errorText(resp.status, await resp.text().catch(() => "")), latency_ms: latency };
    }
    const data = await resp.json().catch(() => ({}));
    const reply = data?.choices?.[0]?.message?.content || "";
    return { ok: true, latency_ms: latency, reply: String(reply).slice(0, 40) };
  } catch (e) {
    const cors = e instanceof TypeError;
    return {
      ok: false,
      latency_ms: Math.round(performance.now() - started),
      error: cors
        ? "浏览器直连失败：该接口没有开放跨域（CORS），换个服务商或在本机跑 Flask 版"
        : `连接失败：${String(e.message || e).slice(0, 120)}`,
    };
  }
}

async function fetchModels(baseUrl, apiKey) {
  try {
    const resp = await fetch(`${normalizeBase(baseUrl)}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!resp.ok) throw new Error(errorText(resp.status, await resp.text().catch(() => "")));
    const data = await resp.json();
    return (data.data || []).map((m) => m.id).filter(Boolean);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("浏览器直连被跨域拦截（CORS），请手动填写模型名");
    }
    throw e;
  }
}

const THINK_MARK = "\u0001T";

/* 直连服务商，把 SSE 转成与 Flask 版一致的纯文本流（思维链折算成 \x01T字数） */
async function aiStream({ record_id, byok }) {
  const conf = byok || saved();
  if (!conf || !conf.api_key) throw new Error("尚未接入 API Key");
  const rec = getRecord(record_id);
  if (!rec) throw new Error("记录不存在");
  const messages = buildMessages(rec.payload);

  let resp;
  try {
    resp = await fetch(endpoint(conf.base_url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conf.api_key}`,
      },
      body: JSON.stringify({
        model: conf.model,
        messages,
        stream: true,
        temperature: conf.temperature ?? 0.7,
        max_tokens: conf.max_tokens || 4096,
      }),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("浏览器直连被拦截：该服务商不允许网页跨域调用（CORS），"
        + "可换 DeepSeek / Kimi，或改用本机 Flask 版");
    }
    throw e;
  }
  if (!resp.ok) throw new Error(errorText(resp.status, await resp.text().catch(() => "")));

  const encoder = new TextEncoder();
  let acc = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let thinkLen = 0;
      let thinkSent = 0;
      const push = (text) => controller.enqueue(encoder.encode(text));

      const handleLine = (line) => {
        if (!line.startsWith("data:")) return false;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return true;
        let chunk;
        try { chunk = JSON.parse(payload); } catch (e) { return false; }
        if (chunk.error) throw new Error(`模型服务返回错误：${chunk.error.message || chunk.error}`);
        const delta = chunk.choices?.[0]?.delta || {};
        if (delta.reasoning_content) {
          thinkLen += delta.reasoning_content.length;
          if (thinkLen - thinkSent >= 300) {
            thinkSent = thinkLen;
            push(`${THINK_MARK}${thinkLen}`);
          }
        }
        if (delta.content) {
          acc += delta.content;
          push(delta.content);
        }
        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();
          for (const line of lines) {
            if (handleLine(line)) { buffer = ""; break; }
          }
        }
        if (buffer) handleLine(buffer);
      } catch (e) {
        controller.error(e);
        return;
      } finally {
        updateLlmText(record_id, acc);
      }
      controller.close();
    },
  });

  return new Response(stream, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/* ---------------- 路由 ---------------- */

async function handle(path, opts = {}) {
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : {};

  if (path === "meta") {
    const conf = BYOK();
    return {
      categories: CATEGORY_LIST,
      providers: PROVIDERS,
      llm: {
        locked: true,
        configured: false,
        has_key: !!conf,
        api_key_masked: "",
        model: conf ? conf.model : null,
        provider: "浏览器直连",
        env_override: false,
      },
    };
  }

  if (path === "chart/liuyao") {
    await ready();
    const plate = paipanLiuyao(body.lines, new Date(), String(body.question || "").slice(0, 200),
      body.category || "zonghe");
    return { record_id: saveRecord(plate), plate };
  }

  if (path === "chart/meihua") {
    await ready();
    const plate = paipanMeihua(new Date(), String(body.question || "").slice(0, 200),
      body.category || "zonghe", body.mode || "time", body.n1, body.n2);
    return { record_id: saveRecord(plate), plate };
  }

  if (path === "history") return { records: listRecords() };

  if (path.startsWith("history/")) {
    const id = Number(path.split("/")[1]);
    if (method === "DELETE") {
      deleteRecord(id);
      return { ok: true };
    }
    const rec = getRecord(id);
    if (!rec) throw new Error("记录不存在");
    return rec;
  }

  if (path === "llm/config") {
    if (method === "POST") {
      const conf = BYOK() || {};
      const merged = { ...conf, ...body };
      writeStore(LLM_STORE, merged);
      return { ok: true, config: merged };
    }
    return { config: BYOK() || {}, providers: PROVIDERS };
  }

  if (path === "llm/test") {
    const conf = body.byok || body;
    return testConnection({ ...saved(), ...conf });
  }

  if (path.startsWith("llm/models")) {
    const qs = new URLSearchParams(path.split("?")[1] || "");
    return { models: await fetchModels(qs.get("base_url"), qs.get("api_key")) };
  }

  throw new Error(`未知接口：${path}`);
}

export const LocalAPI = { handle, aiStream, ready, PROVIDERS };

/* app.js 是普通脚本，通过 window 取用 */
window.LocalAPI = LocalAPI;
