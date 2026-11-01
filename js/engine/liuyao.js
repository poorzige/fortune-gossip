/* 六爻排盘：摇卦六线（6/7/8/9）-> 完整卦盘。
 * 对应 backend/core/liuyao.py */

import { DEFAULT_CATEGORY, CATEGORIES, CHONG, JIN_SETS, LIUHE, ZHI_WUXING, ke,
  liushen, sheng, wangshuai } from "./constants.js";
import { TimeInfo, formatDateTime } from "./calendar.js";
import { Hexagram } from "./hexagram.js";
import { interpretLiuyao } from "./interpret.js";

const YAO_LABELS = { 1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上" };

const yaoLabel = (pos, yinYang) => YAO_LABELS[pos] + (yinYang ? "九" : "六");

/* 爻支与日辰、月建的生克冲合关系 */
function dayMonthRelations(zhi, ti) {
  const riZhi = ti.day_zhi;
  const yueZhi = ti.month_jian;
  const el = ZHI_WUXING[zhi];
  return {
    ri_sheng: sheng(ZHI_WUXING[riZhi], el),
    ri_ke: ke(ZHI_WUXING[riZhi], el),
    ri_bi: ZHI_WUXING[riZhi] === el,
    ri_chong: CHONG[riZhi] === zhi,
    ri_he: LIUHE[riZhi] === zhi,
    yue_sheng: sheng(ZHI_WUXING[yueZhi], el),
    yue_ke: ke(ZHI_WUXING[yueZhi], el),
    yue_bi: ZHI_WUXING[yueZhi] === el,
    yue_po: CHONG[yueZhi] === zhi,
  };
}

export function paipan(inputLines, dt, question = "", category = "zonghe") {
  const lines = Array.from(inputLines);
  if (lines.length !== 6 || lines.some((v) => ![6, 7, 8, 9].includes(v))) {
    throw new Error("爻值须为 6/7/8/9 六个");
  }
  const date = dt instanceof Date ? dt : new Date();
  const timeInfo = new TimeInfo(date);
  const ti = timeInfo.toDict();

  const ben = new Hexagram(lines.map((v) => (v === 7 || v === 9 ? 1 : 0)));
  const dongPositions = [];
  lines.forEach((v, i) => { if (v === 6 || v === 9) dongPositions.push(i); });
  const bian = dongPositions.length ? ben.changed(dongPositions) : null;
  const hu = ben.mutual();
  const fu = ben.fuShen();
  const fuByPos = {};
  Object.values(fu).forEach((v) => { fuByPos[v.pos] = v; });
  const kongZhis = new Set(ti.xun_kong.split(""));

  /* 伏神的日月生克关系（用神伏藏时参断） */
  Object.values(fu).forEach((v) => {
    const zhi = v.gz[1];
    const rel = dayMonthRelations(zhi, ti);
    v.zhi = zhi;
    v.wuxing = ZHI_WUXING[zhi];
    ["ri_sheng", "ri_ke", "yue_sheng", "yue_ke"].forEach((k) => { v[k] = rel[k]; });
  });

  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    const pos = i + 1;
    const value = lines[i];
    const yinYang = value === 7 || value === 9 ? 1 : 0;
    const dong = value === 6 || value === 9;
    const gz = ben.lineGz(i);
    const zhi = gz[1];
    const rel = dayMonthRelations(zhi, ti);
    const row = {
      pos,
      label: yaoLabel(pos, yinYang),
      value,
      yin_yang: yinYang,
      dong,
      dong_mark: dong ? (value === 9 ? "O" : "X") : null,
      shen: liushen(ti.day_gz[0], i),
      qin: ben.lineQin(i),
      gz,
      gan: gz[0],
      zhi,
      wuxing: ZHI_WUXING[zhi],
      shi: ben.shi === pos,
      ying: ben.ying === pos,
      kong: kongZhis.has(zhi),
      yue_wang: wangshuai(ti.month_element, ZHI_WUXING[zhi]),
      ...rel,
      fu: fuByPos[pos] || null,
      bian: null,
    };
    if (dong && bian) {
      const bGz = bian.lineGz(i);
      const bZhi = bGz[1];
      const bEl = ZHI_WUXING[bZhi];
      const el = ZHI_WUXING[zhi];
      row.bian = {
        gz: bGz,
        gan: bGz[0],
        zhi: bZhi,
        wuxing: bEl,
        yin_yang: bian.lines[i],
        /* 变卦六亲：地支按变卦装，六亲按本卦宫五行断 */
        qin: bian.lineQinByPalace(i, ben.palaceElement),
        label: yaoLabel(pos, bian.lines[i]),
        huisheng: sheng(bEl, el),
        huike: ke(bEl, el),
        jintui: JIN_SETS.has(zhi + bZhi) ? "进神" : (JIN_SETS.has(bZhi + zhi) ? "退神" : null),
      };
    }
    rows.push(row);
  }

  const cat = CATEGORIES[category] || CATEGORIES[DEFAULT_CATEGORY];
  const dongYaoci = dongPositions
    .filter((p) => ben.yaoci[p + 1])
    .map((p) => ben.yaoci[p + 1]);

  const benSum = ben.summary();
  [benSum.liuchong, benSum.liuhe] = ben.chonghe();
  let bianSum = null;
  if (bian) {
    bianSum = bian.summary();
    [bianSum.liuchong, bianSum.liuhe] = bian.chonghe();
  }

  const plate = {
    method: "liuyao",
    question,
    category,
    category_label: cat.label,
    category_hint: cat.hint,
    cast_time: formatDateTime(date),
    time_info: ti,
    lines: [...lines],
    ben: benSum,
    hu: hu.summary(),
    bian: bianSum,
    rows,
    dong_positions: dongPositions.map((p) => p + 1),
    dong_yaoci: dongYaoci,
    fu_shen: fu,
  };
  plate.interpretation = interpretLiuyao(plate);
  return plate;
}
