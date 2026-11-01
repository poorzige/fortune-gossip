/* 易学核心常量：干支、五行、八卦、纳甲、八宫卦序、六亲、六神。
 * 与 backend/core/constants.py 一一对应，改这里请同步改 Python 版本。 */

export const TIANGAN = "甲乙丙丁戊己庚辛壬癸";
export const DIZHI = "子丑寅卯辰巳午未申酉戌亥";

export const GAN_WUXING = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
};

export const ZHI_WUXING = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};

export const WUXING = ["木", "火", "土", "金", "水"];
export const SHENG = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
export const KE = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export const CHONG = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};
export const LIUHE = {
  子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯",
  辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午",
};

export const sheng = (a, b) => SHENG[a] === b;
export const ke = (a, b) => KE[a] === b;

/* 先天八卦数：乾一兑二离三震四，巽五坎六艮七坤八。lines 自下而上（初爻在前） */
export const BAGUA = {
  乾: { num: 1, xiang: "天", wuxing: "金", lines: [1, 1, 1] },
  兑: { num: 2, xiang: "泽", wuxing: "金", lines: [1, 1, 0] },
  离: { num: 3, xiang: "火", wuxing: "火", lines: [1, 0, 1] },
  震: { num: 4, xiang: "雷", wuxing: "木", lines: [1, 0, 0] },
  巽: { num: 5, xiang: "风", wuxing: "木", lines: [0, 1, 1] },
  坎: { num: 6, xiang: "水", wuxing: "水", lines: [0, 1, 0] },
  艮: { num: 7, xiang: "山", wuxing: "土", lines: [0, 0, 1] },
  坤: { num: 8, xiang: "地", wuxing: "土", lines: [0, 0, 0] },
};

export const BAGUA_SYMBOLS = {
  乾: "☰", 兑: "☱", 离: "☲", 震: "☳", 巽: "☴", 坎: "☵", 艮: "☶", 坤: "☷",
};

/* 京房纳甲：每卦内卦三支、外卦三支，自下而上 */
export const NAJIA = {
  乾: [["甲子", "甲寅", "甲辰"], ["壬午", "壬申", "壬戌"]],
  坤: [["乙未", "乙巳", "乙卯"], ["癸丑", "癸亥", "癸酉"]],
  震: [["庚子", "庚寅", "庚辰"], ["庚午", "庚申", "庚戌"]],
  巽: [["辛丑", "辛亥", "辛酉"], ["辛未", "辛巳", "辛卯"]],
  坎: [["戊寅", "戊辰", "戊午"], ["戊申", "戊戌", "戊子"]],
  离: [["己卯", "己丑", "己亥"], ["己酉", "己未", "己巳"]],
  艮: [["丙辰", "丙午", "丙申"], ["丙戌", "丙子", "丙寅"]],
  兑: [["丁巳", "丁卯", "丁丑"], ["丁亥", "丁酉", "丁未"]],
};

export function najiaGz(trigram, pos, isOuter) {
  const [inner, outer] = NAJIA[trigram];
  return (isOuter ? outer : inner)[pos];
}

/* 64 卦（文王序）：[卦名, 下卦, 上卦] */
export const KINGWEN = [
  ["乾", "乾", "乾"], ["坤", "坤", "坤"], ["屯", "震", "坎"], ["蒙", "坎", "艮"],
  ["需", "乾", "坎"], ["讼", "坎", "乾"], ["师", "坎", "坤"], ["比", "坤", "坎"],
  ["小畜", "乾", "巽"], ["履", "兑", "乾"], ["泰", "乾", "坤"], ["否", "坤", "乾"],
  ["同人", "离", "乾"], ["大有", "乾", "离"], ["谦", "艮", "坤"], ["豫", "坤", "震"],
  ["随", "震", "兑"], ["蛊", "巽", "艮"], ["临", "兑", "坤"], ["观", "坤", "巽"],
  ["噬嗑", "震", "离"], ["贲", "离", "艮"], ["剥", "坤", "艮"], ["复", "震", "坤"],
  ["无妄", "震", "乾"], ["大畜", "乾", "艮"], ["颐", "震", "艮"], ["大过", "巽", "兑"],
  ["坎", "坎", "坎"], ["离", "离", "离"], ["咸", "艮", "兑"], ["恒", "巽", "震"],
  ["遁", "艮", "乾"], ["大壮", "乾", "震"], ["晋", "坤", "离"], ["明夷", "离", "坤"],
  ["家人", "离", "巽"], ["睽", "兑", "离"], ["蹇", "艮", "坎"], ["解", "坎", "震"],
  ["损", "兑", "艮"], ["益", "震", "巽"], ["夬", "乾", "兑"], ["姤", "巽", "乾"],
  ["萃", "坤", "兑"], ["升", "巽", "坤"], ["困", "坎", "兑"], ["井", "巽", "坎"],
  ["革", "离", "兑"], ["鼎", "巽", "离"], ["震", "震", "震"], ["艮", "艮", "艮"],
  ["渐", "艮", "巽"], ["归妹", "兑", "震"], ["丰", "离", "震"], ["旅", "艮", "离"],
  ["巽", "巽", "巽"], ["兑", "兑", "兑"], ["涣", "坎", "巽"], ["节", "兑", "坎"],
  ["中孚", "兑", "巽"], ["小过", "艮", "震"], ["既济", "离", "坎"], ["未济", "坎", "离"],
];

const HEX_SYMBOLS =
  "䷀䷁䷂䷃䷄䷅䷆䷇䷈䷉䷊䷋䷌䷍䷎䷏䷐䷑䷒䷓䷔䷕䷖䷗䷘䷙䷚䷛䷜䷝䷞䷟" +
  "䷠䷡䷢䷣䷤䷥䷦䷧䷨䷩䷪䷫䷬䷭䷮䷯䷰䷱䷲䷳䷴䷵䷶䷷䷸䷹䷺䷻䷼䷽䷾䷿";

export const hexLines = (lower, upper) => [...BAGUA[lower].lines, ...BAGUA[upper].lines];

export function fullName(name, lower, upper) {
  if (lower === upper) return `${name}为${BAGUA[upper].xiang}`;
  return `${BAGUA[upper].xiang}${BAGUA[lower].xiang}${name}`;
}

export const LINES_TO_ID = new Map();
export const HEX_INFO = {};
KINGWEN.forEach(([n, lo, up], i) => {
  const id = i + 1;
  const lines = hexLines(lo, up);
  LINES_TO_ID.set(lines.join(""), id);
  HEX_INFO[id] = {
    id, name: n, lower: lo, upper: up,
    full_name: fullName(n, lo, up),
    lines,
    symbol: HEX_SYMBOLS[i],
  };
});

/* 八宫卦序（京房）：本宫、一至五世、游魂、归魂 */
export const PALACE_ORDER = ["乾", "坎", "艮", "震", "巽", "离", "坤", "兑"];
export const PALACE_NAMES = {
  乾: "乾宫", 坎: "坎宫", 艮: "艮宫", 震: "震宫",
  巽: "巽宫", 离: "离宫", 坤: "坤宫", 兑: "兑宫",
};

const SHI_TABLE = { 0: 6, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 4, 7: 3 };
const POS_NAMES = {
  0: "本宫卦", 1: "一世卦", 2: "二世卦", 3: "三世卦",
  4: "四世卦", 5: "五世卦", 6: "游魂卦", 7: "归魂卦",
};

function buildPalaces() {
  const table = new Map();
  for (const p of PALACE_ORDER) {
    const pure = hexLines(p, p);
    const seq = [pure];
    let cur = [...pure];
    for (let k = 0; k < 5; k += 1) {
      cur = [...cur];
      cur[k] = 1 - cur[k];
      seq.push(cur);
    }
    cur = [...seq[5]];
    cur[3] = 1 - cur[3];
    seq.push(cur);
    cur = [...seq[6]];
    cur[0] = pure[0];
    cur[1] = pure[1];
    cur[2] = pure[2];
    seq.push(cur);
    seq.forEach((lines, pos) => table.set(lines.join(""), [p, pos]));
  }
  return table;
}

export const LINES_TO_PALACE = buildPalaces();

export function palaceOf(lines) {
  const [p, pos] = LINES_TO_PALACE.get(lines.join(""));
  const shi = SHI_TABLE[pos];
  const ying = ((shi + 2) % 6) + 1;
  return [p, pos, shi, ying];
}

export function palaceGuaming(lines) {
  const [, pos] = LINES_TO_PALACE.get(lines.join(""));
  return POS_NAMES[pos];
}

export const LIUQIN_NAMES = ["兄弟", "父母", "子孙", "官鬼", "妻财"];

export function liuqin(wo, other) {
  if (other === wo) return "兄弟";
  if (sheng(other, wo)) return "父母";
  if (sheng(wo, other)) return "子孙";
  if (ke(other, wo)) return "官鬼";
  if (ke(wo, other)) return "妻财";
  return "兄弟";
}

export const LIUSHEN = ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"];
const DAY_QISHEN = {
  甲: "青龙", 乙: "青龙", 丙: "朱雀", 丁: "朱雀", 戊: "勾陈",
  己: "螣蛇", 庚: "白虎", 辛: "白虎", 壬: "玄武", 癸: "玄武",
};

export function liushen(dayGan, pos) {
  const start = LIUSHEN.indexOf(DAY_QISHEN[dayGan]);
  return LIUSHEN[(start + pos) % 6];
}

export function wangshuai(monthEl, el) {
  if (el === monthEl) return "旺";
  if (sheng(monthEl, el)) return "相";
  if (sheng(el, monthEl)) return "休";
  if (ke(el, monthEl)) return "囚";
  return "死";
}

/* 进神：寅化卯、巳化午、申化酉、亥化子、丑化辰、辰化未、未化戌、戌化丑 */
export const JIN_SETS = new Set([
  "寅卯", "巳午", "申酉", "亥子", "丑辰", "辰未", "未戌", "戌丑",
]);
export const TUI_SETS = new Set([...JIN_SETS].map((s) => s[1] + s[0]));
export const isJin = (a, b) => JIN_SETS.has(a + b);
export const isTui = (a, b) => TUI_SETS.has(a + b);

const XUN_KONG = {
  甲子: "戌亥", 甲戌: "申酉", 甲申: "午未",
  甲午: "辰巳", 甲辰: "寅卯", 甲寅: "子丑",
};

export function xunkong(dayGz) {
  for (let idx = 0; idx < 60; idx += 1) {
    const gz = TIANGAN[idx % 10] + DIZHI[idx % 12];
    if (gz === dayGz) {
      const head = idx - (idx % 10);
      const headGz = TIANGAN[head % 10] + DIZHI[head % 12];
      return XUN_KONG[headGz];
    }
  }
  return "";
}

/* 问事类别：label、用神六亲、说明 */
export const DEFAULT_CATEGORY = "zonghe";

export const CATEGORIES = {
  qiucai: { label: "求财谋利", yongshen: "妻财", hint: "以妻财为用神，子孙为财源，兄弟为劫财之争。" },
  hunyin_m: { label: "姻缘（男问）", yongshen: "妻财", hint: "男占姻缘以妻财为用神，兼看世应之情。" },
  hunyin_f: { label: "姻缘（女问）", yongshen: "官鬼", hint: "女占姻缘以官鬼为用神，兼看世应之情。" },
  shiye: { label: "事业官运", yongshen: "官鬼", hint: "以官鬼为用神，父母为文书辅佐，子孙发动不利官。" },
  kaoshi: { label: "考试文书", yongshen: "父母", hint: "以父母为用神（文书试卷），官鬼为名次。" },
  jiankang: { label: "健康疾病", yongshen: "世爻", hint: "自占病以世爻为身，官鬼为病症，子孙为医药。" },
  chuxing: { label: "出行平安", yongshen: "世爻", hint: "出行以世爻为行人，父母为行李舟车，官鬼为阻碍凶险。" },
  shiwu: { label: "失物寻物", yongshen: "妻财", hint: "以妻财为失物，官鬼为拾者，子孙为寻找之线索。" },
  guansi: { label: "官司纠纷", yongshen: "官鬼", hint: "以世应为主客之情，官鬼为官方或对方，子孙发动可化解。" },
  zonghe: { label: "综合问事", yongshen: "世爻", hint: "无所专指，以世爻为自己，观其旺衰动静。" },
};
