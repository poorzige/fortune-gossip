/* 六爻规则解读：用神旺衰生克 -> 评分与解读文本。
 * 对应 backend/core/interpret.py */

import { CATEGORIES, CHONG, LIUHE, ke, sheng } from "./constants.js";

export const WANG_SCORE = { 旺: 15, 相: 10, 休: -5, 囚: -10, 死: -15 };

const VERDICTS = [
  [75, "大吉", "卦象显示时机与人事俱佳，宜积极进取。"],
  [60, "吉", "卦象偏向顺利，可以着手去办，注意细节即可。"],
  [45, "平", "卦象吉凶参半，事可成但多波折，宜缓图不宜急取。"],
  [30, "不顺", "卦象阻碍较多，宜退守蓄力，暂不宜强求。"],
  [0, "凶", "卦象明显不利，此时举动多有掣肘，建议暂缓计划。"],
];

export function verdictOf(score) {
  for (const [th, name, desc] of VERDICTS) {
    if (score >= th) return [name, desc];
  }
  return ["凶", "卦象明显不利，此时举动多有掣肘，建议暂缓计划。"];
}

const CN_NUM = "一二三四五六";

const rowDesc = (r) => `${CN_NUM[r.pos - 1]}爻·${r.qin}${r.gz}${r.wuxing}`;

/* 用神多现：优先取动爻，次取临世应，再次取首现 */
function pickYongshen(rows, qin) {
  const cands = rows.filter((r) => r.qin === qin);
  if (!cands.length) return null;
  const preds = [(r) => r.dong, (r) => r.shi || r.ying];
  for (const pred of preds) {
    const got = cands.filter(pred);
    if (got.length) return got[0];
  }
  return cands[0];
}

export function interpretLiuyao(plate) {
  const rows = plate.rows;
  const cat = CATEGORIES[plate.category] || CATEGORIES.zonghe;
  const yongQin = cat.yongshen;
  let score = 50;
  const factors = [];
  const add = (name, delta, desc) => {
    score += delta;
    factors.push({ name, delta, desc });
  };

  const shiR = rows.find((r) => r.shi);
  const yingR = rows.find((r) => r.ying);

  /* ---------- 定用神 ---------- */
  let ys;
  let mode;
  let ysDesc;
  if (yongQin === "世爻") {
    ys = shiR;
    mode = "shiyao";
    ysDesc = `以世爻为用神，即 ${rowDesc(ys)}（自占以世为己身）`;
  } else {
    ys = pickYongshen(rows, yongQin);
    if (ys) {
      mode = "present";
      const extra = ys.dong ? "，用神发动" : "";
      ysDesc = `以${yongQin}为用神，即 ${rowDesc(ys)}${extra}`;
    } else {
      mode = "fucang";
      ys = shiR;
      ysDesc = `卦中${yongQin}不上卦，以世爻兼看，另查伏神`;
    }
  }

  const yongInfo = {
    qin: yongQin,
    mode,
    found: mode === "present" || mode === "shiyao",
    pos: ys.pos,
    gz: ys.gz,
    wuxing: ys.wuxing,
    dong: ys.dong,
    wang: ys.yue_wang,
    kong: ys.kong,
    desc: ysDesc,
  };

  /* ---------- 用神分析 ---------- */
  if (mode === "present" || mode === "shiyao") {
    const w = ys.yue_wang;
    add(`用神${w}于月建`, WANG_SCORE[w],
      `用神${ys.gz}${ys.wuxing}于本月（${plate.time_info.month_jian}月建`
      + `${plate.time_info.month_element}）处「${w}」地。`);
    if (ys.yue_po) add("用神月破", -12, "用神与月建相冲，是为月破，事体多有损伤。");
    if (ys.ri_sheng) add("日辰生用神", 10, "日辰生扶用神，得当日天时之助。");
    if (ys.ri_ke) add("日辰克用神", -12, "日辰克制用神，当日人事多有阻力。");
    if (ys.ri_bi) add("日辰比扶", 6, "日辰与用神同气，力量增强。");
    if (ys.ri_he) add("日辰合用神", 4, "日辰与用神相合，事有牵引留连之象。");
    if (ys.ri_chong) {
      if (w === "旺" || w === "相") {
        add("日辰冲动（暗动）", 0, "用神旺相逢冲为暗动，静中有变，事将发动。");
      } else {
        add("日辰冲用神", -8, "用神休囚又被日辰冲散，根基不稳。");
      }
    }
    if (ys.kong) {
      if (w === "旺" || w === "相") {
        add("用神空亡（旺相）", -5, "用神旬空但旺相，空而不败，出旬可成。");
      } else {
        add("用神空亡", -10, "用神落旬空又失令，心愿一时难遂，待出空之期。");
      }
    }

    /* 其他动爻对用神的生克 */
    rows.forEach((r) => {
      if (!r.dong || r === ys) return;
      const el = r.wuxing;
      const yel = ys.wuxing;
      if (sheng(el, yel)) {
        add(`动爻生用神（${r.qin}）`, 8, `${rowDesc(r)} 发动，生扶用神，为得力之助。`);
      } else if (ke(el, yel)) {
        add(`动爻克用神（${r.qin}）`, -8, `${rowDesc(r)} 发动，克制用神，是事中之阻。`);
      } else if (el === yel) {
        add(`动爻比扶用神（${r.qin}）`, 4, `${rowDesc(r)} 发动，与用神同气连枝。`);
      }
    });

    /* 用神自动之化 */
    if (ys.dong && ys.bian) {
      const b = ys.bian;
      if (b.huisheng) add("化回头生", 8, `动化${b.gz}${b.wuxing}回头生，愈动愈旺。`);
      if (b.huike) add("化回头克", -10, `动化${b.gz}${b.wuxing}回头克，自生变数。`);
      if (b.jintui === "进神") add("化进神", 8, "动而化进神，事势步步向前。");
      if (b.jintui === "退神") add("化退神", -6, "动而化退神，事势渐有退意。");
      if (plate.time_info.xun_kong.includes(b.zhi)) {
        add("化入空亡", -6, "动而变爻空亡，变化落空。");
      }
    }
  } else if (mode === "fucang") {
    /* ---------- 用神伏藏 ---------- */
    const fu = plate.fu_shen[yongQin];
    if (fu) {
      add("用神伏藏", -8,
        `${yongQin}不上卦，${fu.qin}${fu.gz}伏于${CN_NUM[fu.pos - 1]}爻之下，事不显达。`);
      if (fu.ri_sheng || fu.yue_sheng) {
        add("伏神得日月生扶", 8, "伏神得日月生扶，出伏之日事可为。");
      }
      if (fu.ri_ke || fu.yue_ke) {
        add("伏神受日月克", -8, "伏神受日月克伤，纵出亦难有力。");
      }
      const fei = rows[fu.pos - 1];
      if (ke(fei.wuxing, fu.wuxing)) {
        add("飞神克伏", -6, `飞神${fei.gz}克伏神，压制重重。`);
      } else if (sheng(fei.wuxing, fu.wuxing)) {
        add("飞神生伏", 4, `飞神${fei.gz}生伏神，暗中相扶。`);
      }
    }
  }

  /* ---------- 世应关系 ---------- */
  if (sheng(yingR.wuxing, shiR.wuxing)) {
    add("应爻生世", 5, "应爻生世，对方（他人、环境）有情于我。");
  } else if (ke(yingR.wuxing, shiR.wuxing)) {
    add("应爻克世", -5, "应爻克世，对方于我有压，交涉须谨慎。");
  }
  if (LIUHE[yingR.zhi] === shiR.zhi) {
    add("世应六合", 4, "世应相合，彼此投契，事可磨合而成。");
  } else if (CHONG[yingR.zhi] === shiR.zhi) {
    add("世应六冲", -4, "世应相冲，双方情谊有隙，多生反复。");
  }
  if (shiR.kong) add("世爻空亡", -4, "世爻空亡，己心未定或自身状态不足。");

  /* ---------- 卦之冲合 ---------- */
  const ben = plate.ben;
  const bian = plate.bian;
  if (ben.liuchong) add("六冲卦", -4, "本卦为六冲卦，事多散乱急变，近事可成久事难聚。");
  if (ben.liuhe) add("六合卦", 4, "本卦为六合卦，人事和合，事迟而终成。");
  if (bian && bian.liuchong) add("卦变六冲", -4, "变卦六冲，结局恐有散局之象。");
  if (bian && bian.liuhe) add("卦变六合", 4, "变卦六合，事至后期渐趋圆满。");

  /* ---------- 类别要点 ---------- */
  categoryFactors(add, rows, plate, cat, ys, mode);

  score = Math.max(5, Math.min(95, score));
  const [name, desc] = verdictOf(score);

  const paragraphs = [
    { title: "用神", text: `${ysDesc}。` },
    { title: "旺衰与动静", text: parWangshuai(plate, ys, mode) },
    { title: "世应与卦象", text: parShiying(plate) },
    { title: "事类要点", text: cat.hint },
    { title: "综合判断", text: `综合诸因素评分 ${score}/100，属「${name}」——${desc}` },
  ];

  return {
    yongshen: yongInfo,
    score,
    verdict: name,
    verdict_desc: desc,
    factors,
    paragraphs,
  };
}

/* 类别专属因素 */
function categoryFactors(add, rows, plate, cat, ys, mode) {
  const key = plate.category;
  const find = (qin) => rows.find((r) => r.qin === qin) || null;

  if (key === "qiucai" || key === "shiwu") {
    const zi = find("子孙");
    const xiong = find("兄弟");
    if (zi && zi.dong && mode === "present" && sheng(zi.wuxing, ys.wuxing)) {
      add("子孙发动生财", 6, "子孙为财之原神，发动生财，财源不断。");
    }
    if (xiong && xiong.dong && mode === "present" && ke(xiong.wuxing, ys.wuxing)) {
      add("兄弟发动克财", -6, "兄弟为劫财之神，发动克财，谨防破耗分利。");
    }
  } else if (key === "shiye" || key === "hunyin_f" || key === "kaoshi") {
    const fumu = find("父母");
    if (fumu && fumu.dong) add("父母发动生助", 4, "父母为文书提携之神，发动于事有扶。");
    const zi = find("子孙");
    if (zi && zi.dong) {
      add("子孙动克官鬼", -6,
        "子孙发动克伤官鬼，于求职官考、女问姻缘皆非吉兆（占病占讼反喜之）。");
    }
  } else if (key === "jiankang") {
    const gui = find("官鬼");
    const zi = find("子孙");
    if (gui) {
      if (gui.dong || gui.yue_wang === "旺" || gui.yue_wang === "相") {
        add("官鬼旺动（病症深）", -8, "官鬼旺相发动，病象明显缠绵。");
      } else if (gui.yue_wang === "死" || gui.yue_wang === "囚") {
        add("官鬼衰弱（病易去）", 6, "官鬼休囚，病症虽显而不深。");
      }
    }
    if (zi) {
      if (zi.dong || zi.yue_wang === "旺" || zi.yue_wang === "相") {
        add("子孙旺相（医药得力）", 6, "子孙为医药福德之神，旺相发动，调治有效。");
      } else if (zi.yue_wang === "死" || zi.yue_wang === "囚") {
        add("子孙衰弱（药力不济）", -6, "子孙休囚，医药之力一时难显。");
      }
    }
  }
}

function parWangshuai(plate, ys, mode) {
  if (mode === "fucang") {
    return "用神不上卦而伏于爻下，事机未显，须待引拔之期（多看日月冲飞、伏神出透之时）。";
  }
  const parts = [`用神${ys.gz}${ys.wuxing}处月建「${ys.yue_wang}」地`];
  const rel = [];
  if (ys.ri_sheng) rel.push("得日辰生扶");
  if (ys.ri_ke) rel.push("受日辰克制");
  if (ys.ri_chong) rel.push("被日辰冲");
  if (ys.kong) rel.push("落旬空");
  if (ys.dong) rel.push("自身发动");
  if (rel.length) parts.push(`，${rel.join("、")}`);
  const nDong = plate.dong_positions.length;
  const tail = nDong === 0 ? "，六爻安静，事以缓图"
    : (nDong <= 2 ? "，动静有常" : "，动爻既多，变化急促");
  parts.push(`。动爻共 ${nDong} 处${tail}`);
  return parts.join("");
}

function parShiying(plate) {
  const rows = plate.rows;
  const shiR = rows.find((r) => r.shi);
  const yingR = rows.find((r) => r.ying);
  const ben = plate.ben;
  let s = `世居${CN_NUM[shiR.pos - 1]}爻（${shiR.qin}${shiR.gz}），`
    + `应在${CN_NUM[yingR.pos - 1]}爻（${yingR.qin}${yingR.gz}）。`
    + `本卦${ben.full_name}，属${ben.palace_name}${ben.palace_element}`
    + `之${ben.palace_guaming}。`;
  if (plate.bian) s += `动而之${plate.bian.full_name}，事有后变之机。`;
  return s;
}
