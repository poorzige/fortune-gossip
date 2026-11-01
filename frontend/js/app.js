/* ============ 八卦命盘 前端逻辑 ============ */
"use strict";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const API = "api";
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  meta: null,
  method: "liuyao",
  casting: false,
  lines: [],          // 六爻线值 6/7/8/9，自下而上
  recordId: null,
  plate: null,
  spins: [0, 0, 0],
  providers: [],
  llm: null,          // 后端脱敏后的模型配置
  aiBusy: false,
};

/* ---------------- 工具 ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toast(msg, ms = 2600) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), ms);
}

async function api(path, opts = {}) {
  const resp = await fetch(`${API}/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败（${resp.status}）`);
  return data;
}

function animateNumber(el, to, dur = 900) {
  if (!el) return;
  if (REDUCED) { el.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------------- 初始化 ---------------- */

async function boot() {
  bindEvents();
  setupReveal();
  renderCastHex();

  try {
    state.meta = await api("meta");
    state.llm = state.meta.llm;
    state.providers = state.meta.providers || [];
  } catch (e) {
    state.llm = { configured: false, locked: false };
    applyLLMLock();
    updateLLMChip();
    toast("无法连接后端服务，请确认已启动 python app.py");
    return;
  }
  fillCategories();
  applyLLMLock();
  updateLLMChip();
  loadHistory();
}

function fillCategories() {
  const sel = $("#category");
  sel.innerHTML = "";
  for (const c of state.meta.categories) {
    const o = document.createElement("option");
    o.value = c.key;
    o.textContent = c.label;
    sel.appendChild(o);
  }
}

function setupReveal() {
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window)) {
    els.forEach((e) => e.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
  els.forEach((e) => io.observe(e));
}

function bindEvents() {
  // 方法切换（带滑动指示器）
  const tabs = $$(".tab");
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      $("#methodTabs").style.setProperty("--tab-index", i);
      state.method = tab.dataset.method;
      $("#panel-liuyao").classList.toggle("hidden", state.method !== "liuyao");
      $("#panel-meihua").classList.toggle("hidden", state.method !== "meihua");
    });
  });

  // 六爻
  $("#btnCastOnce").addEventListener("click", () => castOnce());
  $("#btnCastAuto").addEventListener("click", () => castAuto());
  $("#btnCastReset").addEventListener("click", () => resetCast());

  // 梅花
  $("#btnMeihuaTime").addEventListener("click", () => submitMeihua("time"));
  $("#btnMeihuaNumber").addEventListener("click", () => {
    const n1 = parseInt($("#num1").value, 10);
    const n2 = parseInt($("#num2").value, 10);
    if (!n1 || !n2 || n1 <= 0 || n2 <= 0) {
      toast("数字起卦请输入两个正整数");
      return;
    }
    submitMeihua("number", n1, n2);
  });

  // 回车即起卦
  $("#question").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (state.method === "liuyao") { if (!state.casting && state.lines.length < 6) castOnce(); }
    else submitMeihua("time");
  });

  // 模型接入
  $("#btnOpenLLM").addEventListener("click", openLLM);
  $("#llmChip").addEventListener("click", openLLM);
  $("#llmClose").addEventListener("click", closeLLM);
  $("#llmModal").addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) closeLLM();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#llmModal").classList.contains("open")) closeLLM();
  });
  $("#llmSave").addEventListener("click", saveLLM);
  $("#llmTest").addEventListener("click", testLLM);
  $("#llmFetchModels").addEventListener("click", fetchModels);
  $("#llmEye").addEventListener("click", toggleKeyVisible);
  $("#llmTemp").addEventListener("input", (e) => { $("#llmTempOut").textContent = e.target.value; });
}

/* ---------------- 六爻掷卦 ---------------- */

const YAO_CN = ["初", "二", "三", "四", "五", "上"];
const THROW_TEXT = {
  9: "三背 · 老阳 ○ 动",
  8: "二背一字 · 少阴",
  7: "一背二字 · 少阳",
  6: "三字 · 老阴 ✕ 动",
};

function renderCastHex() {
  const box = $("#castHex");
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const v = state.lines[i];
    if (v === undefined) {
      slots.push(`<div class="slot ghost"><i class="bar"></i></div>`);
      continue;
    }
    const yang = v === 7 || v === 9;
    const dong = v === 6 || v === 9;
    slots.push(
      `<div class="slot ${yang ? "yang" : "yin"}${dong ? " dong" : ""}">` +
      (yang ? `<i class="bar"></i>` : `<i class="bar"></i><i class="bar"></i>`) +
      `</div>`
    );
  }
  box.innerHTML = slots.join("");
}

async function throwCoins() {
  const wraps = $$("#coins .coin-wrap");
  const stage = $("#coinStage");
  const results = [];

  wraps.forEach((wrap, i) => {
    const isBei = Math.random() < 0.5;      // 背为阳，记三
    results.push(isBei ? 3 : 2);
    state.spins[i] += 4 + Math.floor(Math.random() * 3);
    const deg = state.spins[i] * 360 + (isBei ? 180 : 0);
    wrap.querySelector(".coin").style.transform = `rotateY(${deg}deg)`;
    wrap.style.animationDelay = `${i * 45}ms`;
    wrap.classList.remove("throwing");
    void wrap.offsetWidth;                  // 强制 reflow 以重启动画
    wrap.classList.add("throwing");
  });

  stage.classList.add("throwing");
  await sleep(1100);
  stage.classList.remove("throwing");

  const coins = $("#coins");
  coins.classList.add("impact");
  setTimeout(() => coins.classList.remove("impact"), 650);

  return results;
}

async function castOnce() {
  if (state.casting || state.lines.length >= 6) return;
  state.casting = true;
  setCastButtons();
  const n = state.lines.length + 1;
  const prog = $("#castProgress");
  prog.classList.add("busy");
  prog.textContent = `第 ${n} 爻 · 掷卦中……`;

  const results = await throwCoins();
  const sum = results.reduce((a, b) => a + b, 0);
  state.lines.push(sum);
  renderCastHex();

  const names = results.map((r) => (r === 3 ? "背" : "字")).join("");
  prog.textContent = `第 ${n} 爻 · ${names}（${sum}）· ${THROW_TEXT[sum]}`;

  state.casting = false;
  setCastButtons();

  if (state.lines.length === 6) {
    prog.classList.remove("busy");
    await sleep(650);
    submitLiuyao();
  } else {
    prog.classList.remove("busy");
  }
}

async function castAuto() {
  if (state.casting || state.lines.length >= 6) return;
  while (state.lines.length < 6) {
    await castOnce();
    if (state.lines.length < 6) await sleep(420);
  }
}

function resetCast() {
  if (state.casting) return;
  state.lines = [];
  renderCastHex();
  const prog = $("#castProgress");
  prog.classList.remove("busy");
  prog.textContent = "静心凝神，默念所问，点击掷卦";
  setCastButtons();
}

function setCastButtons() {
  const full = state.lines.length >= 6;
  $("#btnCastOnce").disabled = state.casting || full;
  $("#btnCastAuto").disabled = state.casting || full;
  $("#btnCastReset").disabled = state.casting;
}

/* ---------------- 提交排盘 ---------------- */

function currentQuestionBody() {
  return {
    question: $("#question").value.trim(),
    category: $("#category").value,
    time: new Date().toISOString(),
  };
}

async function submitLiuyao() {
  const prog = $("#castProgress");
  try {
    prog.classList.add("busy");
    prog.textContent = "排盘中……";
    const data = await api("chart/liuyao", {
      method: "POST",
      body: JSON.stringify({ lines: state.lines, ...currentQuestionBody() }),
    });
    onPlateLoaded(data);
    resetCast();
  } catch (e) {
    prog.classList.remove("busy");
    prog.textContent = "排盘失败，请重掷";
    toast(e.message);
  }
}

async function submitMeihua(mode, n1, n2) {
  const body = { mode, ...currentQuestionBody() };
  if (mode === "number") { body.n1 = n1; body.n2 = n2; }
  try {
    const data = await api("chart/meihua", { method: "POST", body: JSON.stringify(body) });
    onPlateLoaded(data);
  } catch (e) {
    toast(e.message);
  }
}

function onPlateLoaded(data) {
  state.recordId = data.record_id;
  state.plate = data.plate;
  renderPlate(data.plate);
  loadHistory();
}

function enterResult() {
  const res = $("#result");
  res.classList.remove("hidden");
  $$(":scope > .card", res).forEach((c, i) => c.style.setProperty("--i", i));
  res.classList.remove("enter");
  void res.offsetWidth;
  res.classList.add("enter");
  requestAnimationFrame(() => {
    res.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
  });
}

/* ---------------- 渲染 ---------------- */

const VERDICT_CLASS = { "大吉": "l1", "吉": "l2", "平": "l3", "不顺": "l4", "凶": "l5" };
const VERDICT_COLOR = { l1: "#9a5216", l2: "#4a7641", l3: "#8f7a1c", l4: "#5a6877", l5: "#43413d" };

function renderPlate(plate, savedText) {
  state.aiSavedText = savedText || "";
  renderHead(plate);
  if (plate.method === "liuyao") renderLiuyaoTable(plate);
  else renderMeihuaCards(plate);
  renderTexts(plate);
  renderInterp(plate);
  renderAIDefault(plate, savedText);
  enterResult();
}

function renderHead(plate) {
  const ben = plate.ben;
  const interp = plate.interpretation;
  const ti = plate.time_info;
  const bian = plate.bian;
  let sub;
  if (plate.method === "liuyao") {
    sub = `${ben.palace_name}·${ben.palace_element} · ${ben.palace_guaming}` +
      ` · 世居${YAO_CN[ben.shi - 1]}爻 应居${YAO_CN[ben.ying - 1]}爻` +
      (plate.dong_positions.length
        ? ` · 动${plate.dong_positions.map((p) => YAO_CN[p - 1] + "爻").join("、")}`
        : " · 六爻安静") +
      (bian ? ` · 之 ${bian.full_name}` : "");
  } else {
    sub = `${plate.qigua.mode === "time" ? "时间起卦" : "数字起卦"} · ` +
      `体 ${plate.ti.gua}（${plate.ti.wuxing}） · 用 ${plate.yong.gua}（${plate.yong.wuxing}） · ` +
      `动${YAO_CN[plate.qigua.dong - 1]}爻`;
  }

  $("#plateHead").innerHTML = `
    <div class="row1">
      <span class="hex-symbol">${ben.symbol}</span>
      <span class="hex-name">${esc(ben.full_name)}</span>
      <span class="seal ${VERDICT_CLASS[interp.verdict] || ""}">${esc(interp.verdict)}</span>
      <span class="score-wrap">
        <span class="score-num" data-score="${interp.score}">0</span>
        <span class="score-bar"><i></i></span>
      </span>
    </div>
    <div class="hex-sub">${sub}</div>
    <div class="time-line">
      ${esc(ti.lunar)} ｜ <b>${ti.year_gz}</b>年 <b>${ti.month_gz}</b>月 <b>${ti.day_gz}</b>日 <b>${ti.hour_gz}</b>时
      　月建<b>${ti.month_jian}</b>(${ti.month_element})　日辰<b>${ti.day_zhi}</b>　旬空<b>${ti.xun_kong}</b>
    </div>
    ${plate.question ? `<div class="time-line">所问：<b>${esc(plate.question)}</b>（${esc(plate.category_label)}）</div>` : ""}
  `;

  requestAnimationFrame(() => {
    const bar = $("#plateHead .score-bar i");
    if (bar) bar.style.width = `${interp.score}%`;
    animateNumber($("#plateHead .score-num"), interp.score);
  });
  // 兜底：标签页在后台时 rAF 会被节流，确保最终值一定落地
  setTimeout(() => {
    const num = $("#plateHead .score-num");
    const bar = $("#plateHead .score-bar i");
    if (num) num.textContent = interp.score;
    if (bar) bar.style.width = `${interp.score}%`;
  }, 1300);
}

/* --- 六爻盘表格 --- */

function renderLiuyaoTable(plate) {
  const rows = [...plate.rows].reverse();   // 上爻在前
  const trs = rows.map((r, idx) => {
    const fu = r.fu
      ? `<span class="gong">${esc(r.fu.qin)}</span><br><span class="gong">${esc(r.fu.gz)}</span>`
      : "";
    const dongMark = r.dong
      ? `<span class="dong-mark">${r.dong_mark === "O" ? "○" : "✕"}</span>` : "";
    const yao = r.yin_yang
      ? `<span class="t-yao yang"></span>`
      : `<span class="t-yao yin"></span>`;
    let bianCell = "";
    if (r.bian) {
      const tags = [];
      if (r.bian.huisheng) tags.push("回头生");
      if (r.bian.huike) tags.push("回头克");
      if (r.bian.jintui) tags.push(r.bian.jintui);
      bianCell = `<span class="bian-qin">${esc(r.bian.qin)}</span> ${esc(r.bian.gz)}` +
        (tags.length ? `<br><span class="tag-kong">${tags.map(esc).join(" · ")}</span>` : "");
    }
    return `
    <tr class="${r.dong ? "dong-row" : ""} ${r.shi ? "shi-row" : ""}" style="--i:${idx}">
      <td>${fu}</td>
      <td>${esc(r.shen)}</td>
      <td class="qin">${esc(r.qin)}</td>
      <td>${yao}${dongMark}</td>
      <td>${esc(r.label)}<br><span class="gong">${esc(r.gz)}·${esc(r.wuxing)}·${esc(r.yue_wang)}${r.kong ? "·空" : ""}${r.yue_po ? "·破" : ""}</span></td>
      <td class="shi-ying">${r.shi ? "世" : r.ying ? "应" : ""}</td>
      <td>${bianCell}</td>
    </tr>`;
  }).join("");

  $("#plateCard").innerHTML = `
    <h2 class="card-title"><span>六 爻 卦 盘</span></h2>
    <div class="plate-table-wrap">
      <table class="plate">
        <thead>
          <tr>
            <th>伏神</th><th>六神</th><th>本卦六亲</th><th>爻象</th>
            <th>爻题 · 纳甲</th><th>世应</th><th>动变${plate.bian ? `（${esc(plate.bian.name)}）` : ""}</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
    <p class="tip">本卦 <b>${esc(plate.ben.full_name)}</b>（${esc(plate.ben.palace_name)}${esc(plate.ben.palace_element)}之${esc(plate.ben.palace_guaming)}）
      ${plate.bian ? ` · 之 <b>${esc(plate.bian.full_name)}</b>` : ""}
      · 互卦 ${esc(plate.hu.full_name)}
      ${plate.ben.liuchong ? " · 六冲卦" : ""}${plate.ben.liuhe ? " · 六合卦" : ""}</p>
  `;
}

/* --- 梅花三卦 --- */

function renderMeihuaCards(plate) {
  const dong = plate.qigua.dong;
  const cards = [
    ["本卦", plate.ben, true],
    ["互卦", plate.hu, false],
    ["变卦", plate.bian, false],
  ].map(([label, g, isBen]) => {
    const slots = [...g.lines].map((y, i) => `
      <div class="slot ${y ? "yang" : "yin"} ${isBen && i === dong - 1 ? "dong" : ""}">
        ${y ? `<i class="bar"></i>` : `<i class="bar"></i><i class="bar"></i>`}
      </div>`).join("");
    let badges = "";
    if (isBen) {
      const upIsTi = plate.ti.position === "上卦";
      badges = `
        <div>
          <span class="mh-badge ${upIsTi ? "ti" : "yong"}">上${esc(plate.ben.upper)}·${upIsTi ? "体" : "用"}</span>
          <span class="mh-badge ${upIsTi ? "yong" : "ti"}">下${esc(plate.ben.lower)}·${upIsTi ? "用" : "体"}</span>
        </div>`;
    }
    return `
    <div class="mh-card">
      <div class="mh-label">${label}</div>
      <div class="mh-name">${esc(g.full_name)}</div>
      <div class="mh-gua">${esc(g.symbol)} 上${esc(g.upper)} 下${esc(g.lower)}</div>
      <div class="mh-hex">${slots}</div>
      ${badges}
    </div>`;
  }).join("");

  $("#plateCard").innerHTML = `
    <h2 class="card-title"><span>梅 花 卦 象</span></h2>
    <p class="tip" style="text-align:left">${esc(plate.qigua.desc)}</p>
    <div class="mh-cards">${cards}</div>
    <div class="mh-relation">体 <b>${esc(plate.ti.gua)}（${esc(plate.ti.wuxing)}）</b> 与
      用 <b>${esc(plate.yong.gua)}（${esc(plate.yong.wuxing)}）</b> 论生克，
      动爻在${esc(plate.yong.position)}，用卦为动、体卦为静。</div>
  `;
}

/* --- 卦爻辞 --- */

function renderTexts(plate) {
  const ben = plate.ben;
  const parts = [];
  parts.push(`<p><span class="gtitle">${esc(ben.name)}卦辞</span>${esc(ben.guaci)}</p>`);
  for (const y of plate.dong_yaoci) {
    parts.push(`<p class="yaoci-dong"><em>${esc(y.label)}（动爻）</em>${esc(y.text)}</p>`);
  }
  if (plate.bian && plate.method === "liuyao") {
    parts.push(`<p><span class="gtitle">${esc(plate.bian.name)}卦辞</span>${esc(plate.bian.guaci)}</p>`);
  }
  $("#textCard").innerHTML = `
    <h2 class="card-title"><span>经 文</span></h2>
    <div class="yaoci-block">${parts.join("")}</div>
  `;
}

/* --- 规则解读 --- */

function renderInterp(plate) {
  const it = plate.interpretation;
  const paragraphs = it.paragraphs.map((p) =>
    `<div class="p-item"><span class="p-title">【${esc(p.title)}】</span><span class="p-text">${esc(p.text)}</span></div>`
  ).join("");

  const factors = it.factors.map((f, i) => {
    const cls = f.delta > 0 ? "pos" : f.delta < 0 ? "neg" : "zero";
    const sign = f.delta > 0 ? `+${f.delta}` : `${f.delta}`;
    return `<span class="factor ${cls}" style="animation-delay:${Math.min(i * 35, 420)}ms"
              title="${esc(f.desc)}"><span class="delta">${sign}</span>${esc(f.name)}</span>`;
  }).join("");

  $("#interpBody").innerHTML = `
    <div class="interp-verdict">
      <span class="seal ${VERDICT_CLASS[it.verdict] || ""}">${esc(it.verdict)}</span>
      <span class="vd">${esc(it.verdict_desc)}　评分 <b>${it.score}</b>/100</span>
    </div>
    <div class="interp-paragraphs">${paragraphs}</div>
    ${factors ? `<div class="factors"><div class="f-title">加 减 之 数</div><div class="factor-list">${factors}</div></div>` : ""}
  `;
}

/* --- AI 解卦 --- */

function aiToolbar(conf, hasText) {
  if (!conf || !conf.configured) return "";
  return `
    <div class="ai-toolbar">
      <span class="ai-model"><i class="dot"></i><em>${esc(conf.model || "未命名模型")}</em>
        <span>· ${esc(conf.provider || "自定义接口")}</span></span>
      <div class="ai-actions">
        ${hasText ? `<button class="btn small ghost" id="btnAIRegen">重新解读</button>` : ""}
        ${conf.locked ? "" : `<button class="btn small ghost" id="btnAISettings">更换模型</button>`}
      </div>
    </div>`;
}

function bindAIToolbar() {
  const regen = $("#btnAIRegen");
  if (regen) regen.addEventListener("click", requestAI);
  const cfg = $("#btnAISettings");
  if (cfg) cfg.addEventListener("click", openLLM);
}

function renderAIDefault(plate, savedText) {
  const body = $("#aiBody");
  const conf = state.llm || {};

  if (savedText) {
    body.innerHTML = aiToolbar(conf, true) +
      `<div class="ai-stream">${mdLite(savedText)}</div>`;
    bindAIToolbar();
    return;
  }

  if (conf.configured) {
    body.innerHTML = aiToolbar(conf, false) + `
      <div class="ai-body-default">
        <button class="btn primary" id="btnAI">求 AI 解卦</button>
        <div class="ai-note">结合整张卦盘、卦爻辞与规则分析，由 <b>${esc(conf.model)}</b> 生成四节解读。</div>
      </div>`;
    $("#btnAI").addEventListener("click", requestAI);
    bindAIToolbar();
    return;
  }

  if (conf.locked) {
    body.innerHTML = `
      <div class="ai-body-default">
        <div class="ai-note">本站未开启 AI 解卦，排盘与规则断语不受影响。<br>
        想用 AI 解读，可以把项目跑在本地，在右上角「模型接入」里填自己的 Key。</div>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="ai-body-default">
      <div class="ai-note">尚未接入大模型。可接入任意 OpenAI 兼容接口 —— DeepSeek、智谱 GLM、Kimi、通义、OpenAI、本地 Ollama …<br>
      密钥只保存在本机 <code>backend/config.json</code>，规则断语不受影响。</div>
      <div style="margin-top:16px"><button class="btn primary" id="btnAIConfig">接 入 模 型</button></div>
    </div>`;
  $("#btnAIConfig").addEventListener("click", openLLM);
}

async function requestAI() {
  if (state.aiBusy) return;
  if (!state.recordId) { toast("请先完成一次排盘"); return; }
  state.aiBusy = true;

  const body = $("#aiBody");
  const stream = document.createElement("div");
  stream.className = "ai-stream";

  const waiting = document.createElement("div");
  waiting.className = "ai-note ai-waiting";
  waiting.innerHTML = `正在推演卦理<span class="ai-dots"><i></i><i></i><i></i></span>`
    + `　模型排队与思考可能需要一两分钟`;
  stream.appendChild(waiting);

  body.innerHTML = aiToolbar(state.llm || {}, false);
  body.appendChild(stream);
  bindAIToolbar();

  let raw = "";            // 原始流（含思维链进度标记 \x01T字数）
  let acc = "";            // 纯正文
  let lastThink = 0;
  const THINK_RE = /\x01T(\d+)/g;

  try {
    const resp = await fetch(`${API}/interpret/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_id: state.recordId }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.error || `请求失败（${resp.status}）`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });

      THINK_RE.lastIndex = 0;
      let m;
      while ((m = THINK_RE.exec(raw)) !== null) lastThink = parseInt(m[1], 10);

      // 剔除以不完整标记结尾的片段，避免闪烁
      let renderable = raw;
      const partial = renderable.match(/\x01T\d*$/);
      if (partial) renderable = renderable.slice(0, partial.index);
      acc = renderable.replace(/\x01T\d+/g, "");

      if (acc) {
        if (waiting.parentNode) waiting.remove();
        stream.innerHTML = mdLite(acc) + `<span class="ai-cursor"></span>`;
      } else if (lastThink) {
        waiting.innerHTML = `模型推演中……已思考 ${lastThink} 字，正文稍后呈现`
          + `<span class="ai-dots"><i></i><i></i><i></i></span>`;
      }
    }

    acc = raw.replace(/\x01T\d+/g, "");
    stream.innerHTML = acc ? mdLite(acc) : waiting.outerHTML;
    if (!acc) throw new Error("模型未返回内容");
  } catch (e) {
    if (acc) stream.innerHTML = mdLite(acc);
    const err = document.createElement("div");
    err.className = "ai-error";
    err.textContent = `解读中断：${e.message}`;
    body.appendChild(err);
  } finally {
    state.aiBusy = false;
  }
}

/* 极简 Markdown：### 标题 / **加粗** / `代码` / 有序无序列表 / 段落 */
function mdLite(text) {
  const lines = esc(text).split(/\r?\n/);
  let html = "";
  let list = null;   // "ul" | "ol"

  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const line of lines) {
    const t = line.trim();
    if (!t) { closeList(); continue; }

    const h = t.match(/^(#{2,4})\s*(.+)$/);
    if (h) {
      closeList();
      html += `<h3>${inline(h[2])}</h3>`;
      continue;
    }
    const ul = t.match(/^[-·•]\s+(.+)$/);
    if (ul) {
      if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
      html += `<li>${inline(ul[1])}</li>`;
      continue;
    }
    const ol = t.match(/^\d+[.、)]\s*(.+)$/);
    if (ol) {
      if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
      html += `<li>${inline(ol[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inline(t)}</p>`;
  }
  closeList();
  return html;
}

/* ---------------- 模型接入 ---------------- */

function updateLLMChip() {
  const chip = $("#llmChip");
  const txt = $("#llmChipText");
  const conf = state.llm || {};
  chip.classList.remove("ok", "off");
  if (conf.configured) {
    chip.classList.add("ok");
    txt.textContent = conf.locked
      ? `AI 已开启 · ${conf.model || ""}`
      : `${conf.provider || "模型"} · ${conf.model || ""}`;
  } else {
    chip.classList.add("off");
    txt.textContent = conf.locked ? "AI 未开启" : "未接入模型";
  }
}

/* 公开部署时后端会锁掉模型配置，前端相应地收起入口 */
function applyLLMLock() {
  const locked = !!(state.llm && state.llm.locked);
  const btn = $("#btnOpenLLM");
  if (btn) btn.style.display = locked ? "none" : "";
  const chip = $("#llmChip");
  if (chip) chip.title = locked ? "本站模型由站长统一配置" : "查看或更换已接入的模型";
}

function openLLM() {
  if (state.llm && state.llm.locked) {
    toast("本站的模型由站长统一配置，不开放修改");
    return;
  }
  const modal = $("#llmModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  fillLLMForm(state.llm || {});
  renderProviders();
  setLLMMsg("");
  setTimeout(() => $("#llmBase").focus(), 120);
}

function closeLLM() {
  const modal = $("#llmModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderProviders() {
  const grid = $("#providerGrid");
  if (!state.providers.length) { grid.innerHTML = ""; return; }
  const current = normalizeUrl($("#llmBase").value || (state.llm || {}).base_url || "");
  grid.innerHTML = state.providers.map((p) => {
    const active = p.base_url && current && normalizeUrl(p.base_url) === current;
    return `<button type="button" class="provider-chip${active ? " active" : ""}"
              data-id="${esc(p.id)}" title="${esc(p.note || p.name)}">${esc(p.name)}</button>`;
  }).join("");
  $$(".provider-chip", grid).forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = state.providers.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      $$(".provider-chip", grid).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (p.base_url) $("#llmBase").value = p.base_url;
      if (p.model) $("#llmModel").value = p.model;
      if (p.note) setLLMMsg(`${p.name}：${p.note}`, "");
      if (p.id === "ollama") {
        $("#llmKey").placeholder = "本地服务通常无需 Key，可留空";
      } else {
        $("#llmKey").placeholder = state.llm && state.llm.has_key
          ? `已保存的密钥（留空保持不变）`
          : "填写 API Key";
        $("#llmKeyHint").textContent = state.llm && state.llm.has_key
          ? `已保存密钥 ${state.llm.api_key_masked}，切换服务商时请填写新的 Key`
          : "尚未保存密钥";
      }
    });
  });
}

function normalizeUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "").toLowerCase();
}

function fillLLMForm(conf) {
  $("#llmBase").value = conf.base_url || "";
  $("#llmModel").value = conf.model || "";
  $("#llmKey").value = "";
  $("#llmKey").type = "password";
  $("#llmEye").textContent = "显示";
  $("#llmKey").placeholder = conf.has_key
    ? `已保存 ${conf.api_key_masked}（留空保持不变）`
    : "填写 API Key（本地 Ollama 可留空）";
  $("#llmKeyHint").textContent = conf.has_key
    ? `已保存密钥 ${conf.api_key_masked}，不会回传到浏览器`
    : "尚未保存密钥";
  $("#llmKeyHint").className = "field-hint";

  const temp = conf.temperature ?? 0.7;
  $("#llmTemp").value = temp;
  $("#llmTempOut").textContent = temp;
  $("#llmMax").value = conf.max_tokens ?? 8192;
  $("#llmThinking").checked = conf.disable_thinking !== false;
}

function llmFormValues() {
  const v = {
    base_url: $("#llmBase").value.trim(),
    model: $("#llmModel").value.trim(),
    temperature: parseFloat($("#llmTemp").value),
    max_tokens: parseInt($("#llmMax").value, 10),
    disable_thinking: $("#llmThinking").checked,
  };
  const key = $("#llmKey").value.trim();
  if (key) v.api_key = key;
  return v;
}

function setLLMMsg(msg, kind = "") {
  const el = $("#llmMsg");
  el.textContent = msg;
  el.className = "modal-msg" + (kind ? ` ${kind}` : "");
}

function toggleKeyVisible() {
  const input = $("#llmKey");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#llmEye").textContent = show ? "隐藏" : "显示";
}

async function saveLLM() {
  const payload = llmFormValues();
  if (!payload.base_url) { setLLMMsg("请填写接口地址", "err"); return; }
  if (!payload.model) { setLLMMsg("请填写模型名称", "err"); return; }
  const btn = $("#llmSave");
  btn.disabled = true;
  setLLMMsg("保存中……", "busy");
  try {
    const r = await api("llm/config", { method: "POST", body: JSON.stringify(payload) });
    state.llm = r.config;
    updateLLMChip();
    setLLMMsg(`已保存并启用：${r.config.model}（${r.config.provider}）`, "ok");
    toast("模型已接入，可以解卦了");
    $("#llmKey").value = "";
    fillLLMForm(r.config);
    renderProviders();
    if (state.plate) renderAIDefault(state.plate, state.aiSavedText);
  } catch (e) {
    setLLMMsg(e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function testLLM() {
  const payload = llmFormValues();
  if (!payload.base_url || !payload.model) {
    setLLMMsg("先填写接口地址与模型名称再测试", "err");
    return;
  }
  const btn = $("#llmTest");
  btn.disabled = true;
  setLLMMsg("正在连接模型……", "busy");
  try {
    const r = await api("llm/test", { method: "POST", body: JSON.stringify(payload) });
    if (r.ok) {
      setLLMMsg(`连接成功 · ${r.latency_ms}ms · 模型回复「${r.reply || "（空）"}」`, "ok");
    } else {
      setLLMMsg(`连接失败：${r.error}`, "err");
    }
  } catch (e) {
    setLLMMsg(e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function fetchModels() {
  const base = $("#llmBase").value.trim();
  if (!base) { setLLMMsg("请先填写接口地址", "err"); return; }
  const btn = $("#llmFetchModels");
  btn.disabled = true;
  btn.textContent = "拉取中…";
  try {
    const params = new URLSearchParams({ base_url: base });
    const key = $("#llmKey").value.trim();
    if (key) params.set("api_key", key);
    const r = await api(`llm/models?${params.toString()}`);
    $("#llmModelList").innerHTML = r.models
      .map((m) => `<option value="${esc(m)}"></option>`).join("");
    setLLMMsg(`已获取 ${r.models.length} 个模型，点击模型输入框可下拉选择`, "ok");
  } catch (e) {
    setLLMMsg(`拉取失败：${e.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "拉取列表";
  }
}

/* ---------------- 历史 ---------------- */

async function loadHistory() {
  try {
    const data = await api("history");
    renderHistory(data.records);
  } catch (e) { /* 静默失败，不打断主流程 */ }
}

function renderHistory(records) {
  const ul = $("#historyList");
  if (!records.length) {
    ul.innerHTML = `<li class="h-empty">尚无占卜记录</li>`;
    return;
  }
  ul.innerHTML = records.map((r, i) => {
    const color = VERDICT_COLOR[VERDICT_CLASS[r.verdict]] || "#43413d";
    return `
    <li data-id="${r.id}" class="${state.recordId === r.id ? "active" : ""}" style="--i:${i}">
      <div class="h-main">
        <div class="h-name"><span class="h-method">${r.method === "liuyao" ? "六爻" : "梅花"}</span>${esc(r.hexagram_name)}</div>
        <div class="h-q">${esc(r.question) || "（未填所问）"}</div>
        <div class="h-date">${esc(r.created_at)}</div>
      </div>
      <span class="h-verdict" style="color:${color}">${esc(r.verdict)} ${r.score ?? ""}</span>
      <button class="h-del" title="删除" data-del="${r.id}">✕</button>
    </li>`;
  }).join("");

  $$("li[data-id]", ul).forEach((li) => {
    li.addEventListener("click", () => loadRecord(parseInt(li.dataset.id, 10)));
  });
  $$("[data-del]", ul).forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = parseInt(btn.dataset.del, 10);
      if (!confirm("删除这条占卜记录？")) return;
      try {
        await api(`history/${id}`, { method: "DELETE" });
        if (state.recordId === id) state.recordId = null;
        loadHistory();
      } catch (e) { toast(e.message); }
    });
  });
}

async function loadRecord(id) {
  try {
    const rec = await api(`history/${id}`);
    state.recordId = id;
    state.plate = rec.payload;
    $("#question").value = rec.question || "";
    renderPlate(rec.payload, rec.llm_text);
    $$("#historyList li").forEach((li) =>
      li.classList.toggle("active", parseInt(li.dataset.id, 10) === id));
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- 启动 ---------------- */

document.addEventListener("DOMContentLoaded", boot);
