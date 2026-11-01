/* 梅花易数：时间/数字起卦，体用互变，生克断吉凶。
 * 对应 backend/core/meihua.py */

import { BAGUA, CATEGORIES, DEFAULT_CATEGORY, ke, sheng, wangshuai } from "./constants.js";
import { TimeInfo, formatDateTime } from "./calendar.js";
import { Hexagram } from "./hexagram.js";
import { verdictOf } from "./interpret.js";

/* 先天卦数：乾一兑二离三震四，巽五坎六艮七坤八 */
export const NUM_TO_GUA = Object.fromEntries(
  Object.entries(BAGUA).map(([name, g]) => [g.num, name]),
);

const guaInfo = (name) => ({
  gua: name,
  xiang: BAGUA[name].xiang,
  wuxing: BAGUA[name].wuxing,
  num: BAGUA[name].num,
});

/* 起卦，返回 [上卦名, 下卦名, 动爻1-6, 起卦说明] */
export function qigua(timeInfo, mode = "time", n1 = null, n2 = null) {
  if (mode === "number") {
    if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 <= 0 || n2 <= 0) {
      throw new Error("数字起卦须提供两个正整数");
    }
    const upper = n1 % 8 || 8;
    const lower = n2 % 8 || 8;
    const dong = (n1 + n2) % 6 || 6;
    const desc = `以数起卦：第一数 ${n1} 除八余 ${upper} 为上卦（${NUM_TO_GUA[upper]}），`
      + `第二数 ${n2} 除八余 ${lower} 为下卦（${NUM_TO_GUA[lower]}），`
      + `两数之和 ${n1 + n2} 除六余 ${dong} 为动爻。`;
    return [NUM_TO_GUA[upper], NUM_TO_GUA[lower], dong, desc];
  }

  const y = timeInfo.yearZhiNum();
  const m = Math.abs(timeInfo.lunarMonth);
  const d = timeInfo.lunarDay;
  const h = timeInfo.hourNum();
  const s1 = y + m + d;
  const s2 = s1 + h;
  const upper = s1 % 8 || 8;
  const lower = s2 % 8 || 8;
  const dong = s2 % 6 || 6;
  const desc = `以时起卦：${timeInfo.lunarStr}，年支数 ${y} + 月 ${m} + 日 ${d} = ${s1}，`
    + `除八余 ${upper} 为上卦（${NUM_TO_GUA[upper]}）；加时辰数 ${h} 得 ${s2}，`
    + `除八余 ${lower} 为下卦（${NUM_TO_GUA[lower]}）；`
    + `${s2} 除六余 ${dong} 为动爻。`;
  return [NUM_TO_GUA[upper], NUM_TO_GUA[lower], dong, desc];
}

export function paipan(dt, question = "", category = "zonghe", mode = "time", n1 = null, n2 = null) {
  const date = dt instanceof Date ? dt : new Date();
  const timeInfo = new TimeInfo(date);
  const [upper, lower, dong, qiguaDesc] = qigua(timeInfo, mode, n1, n2);

  const ben = new Hexagram([...BAGUA[lower].lines, ...BAGUA[upper].lines]);
  const dongI = dong - 1;
  const bian = ben.changed([dongI]);
  const hu = ben.mutual();

  /* 体用：动爻所在之卦为「用」，静而不动之卦为「体」 */
  const dongInLower = dongI < 3;
  const ti = guaInfo(dongInLower ? upper : lower);
  const yong = guaInfo(dongInLower ? lower : upper);
  ti.position = dongInLower ? "上卦" : "下卦";
  yong.position = dongInLower ? "下卦" : "上卦";

  const cat = CATEGORIES[category] || CATEGORIES[DEFAULT_CATEGORY];
  const dongYaoci = ben.yaoci[dong] ? [ben.yaoci[dong]] : [];

  const plate = {
    method: "meihua",
    mode,
    question,
    category,
    category_label: cat.label,
    category_hint: cat.hint,
    cast_time: formatDateTime(date),
    time_info: timeInfo.toDict(),
    qigua: { desc: qiguaDesc, dong, mode, n1, n2 },
    ben: ben.summary(),
    hu: hu.summary(),
    bian: bian.summary(),
    ti,
    yong,
    dong_yaoci: dongYaoci,
  };
  plate.interpretation = interpretMeihua(plate, plate.time_info, ben, hu, bian, ti, yong);
  return plate;
}

const REL_TEXT = {
  yong_sheng_ti: "用生体，外境来生扶自己，主进益之喜",
  ti_ke_yong: "体克用，我制外境，费力而可成，如逆水行舟得桨",
  bihesh: "体用比和，内外同气，事事谐顺",
  ti_sheng_yong: "体生用，自我耗泄付出，劳而少功",
  yong_ke_ti: "用克体，外境克伤自己，主阻滞不顺",
};
const REL_SCORE = {
  yong_sheng_ti: 20, ti_ke_yong: 8, bihesh: 10, ti_sheng_yong: -10, yong_ke_ti: -20,
};

function relation(yongEl, tiEl) {
  if (sheng(yongEl, tiEl)) return "yong_sheng_ti";
  if (ke(yongEl, tiEl)) return "yong_ke_ti";
  if (ke(tiEl, yongEl)) return "ti_ke_yong";
  if (sheng(tiEl, yongEl)) return "ti_sheng_yong";
  return "bihesh";
}

function interpretMeihua(plate, timeInfo, ben, hu, bian, ti, yong) {
  let score = 50;
  const factors = [];
  const add = (name, delta, desc) => {
    score += delta;
    factors.push({ name, delta, desc });
  };

  const tiEl = ti.wuxing;

  /* 体用生克（大纲） */
  const rel = relation(yong.wuxing, tiEl);
  add(`体用：${REL_TEXT[rel].split("，")[0]}`, REL_SCORE[rel],
    `体卦${ti.gua}（${ti.wuxing}）为${ti.position === "上卦" ? "上" : "下"}卦，`
    + `用卦${yong.gua}（${yong.wuxing}）为${yong.position === "上卦" ? "上" : "下"}卦。`
    + `${REL_TEXT[rel]}。`);

  /* 互卦（中间过程）：互卦二重，分别与体论生克 */
  const huParts = [];
  [["下互", hu.lower], ["上互", hu.upper]].forEach(([side, guaName]) => {
    const el = BAGUA[guaName].wuxing;
    const r = relation(el, tiEl);
    const d = { yong_sheng_ti: 4, ti_ke_yong: 2, bihesh: 2, ti_sheng_yong: -3, yong_ke_ti: -4 }[r];
    add(`互卦${side}${guaName}${el}（${REL_TEXT[r].split("，")[0]}）`, d,
      `互卦${side}${guaName}属${el}，${REL_TEXT[r]}，此为事之中段。`);
    huParts.push(`${side}${guaName}（${el}）`);
  });

  /* 变卦（结局）：变卦中用卦所变之五行对体 */
  const bianYongGua = yong.position === "下卦" ? bian.lower : bian.upper;
  const byEl = BAGUA[bianYongGua].wuxing;
  const r2 = relation(byEl, tiEl);
  const d2 = { yong_sheng_ti: 10, ti_ke_yong: 4, bihesh: 6, ti_sheng_yong: -6, yong_ke_ti: -10 }[r2];
  add(`变卦${bianYongGua}${byEl}（${REL_TEXT[r2].split("，")[0]}）`, d2,
    `用卦变而为${bianYongGua}（${byEl}），${REL_TEXT[r2]}，此为事之归宿。`);

  /* 体卦旺衰于月令 */
  const w = wangshuai(timeInfo.month_element, tiEl);
  const ws = { 旺: 10, 相: 6, 休: -4, 囚: -8, 死: -12 }[w];
  add(`体卦${w}于时令`, ws,
    `体卦${ti.gua}属${tiEl}，于月建${timeInfo.month_jian}`
    + `（${timeInfo.month_element}）之时处「${w}」地。`);

  score = Math.max(5, Math.min(95, score));
  const [name, desc] = verdictOf(score);

  const paragraphs = [
    { title: "起卦", text: plate.qigua.desc },
    {
      title: "体用",
      text: `动爻在${yong.position === "下卦" ? "下" : "上"}卦，故`
        + `${yong.position}（${yong.gua}，${yong.wuxing}）为用，`
        + `${ti.position}（${ti.gua}，${ti.wuxing}）为体。${REL_TEXT[rel]}。`,
    },
    { title: "中间过程", text: `互卦为${huParts.join("、")}，观事之中段变化。` },
    { title: "最终归宿", text: `变卦${bian.fullName}，用卦化${bianYongGua}，${REL_TEXT[r2]}。` },
    { title: "综合判断", text: `综合评分 ${score}/100，属「${name}」——${desc}` },
  ];

  return {
    score,
    verdict: name,
    verdict_desc: desc,
    factors,
    paragraphs,
    ti_yong_relation: rel,
  };
}
