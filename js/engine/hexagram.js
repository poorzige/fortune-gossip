/* 卦象模型：六爻 -> 卦序、卦宫、世应、互卦、变卦。
 * 对应 backend/core/hexagram.py */

import {
  BAGUA, CHONG, DIZHI, HEX_INFO, LIUHE, LIUQIN_NAMES, LINES_TO_ID,
  ZHI_WUXING, liuqin, najiaGz, palaceGuaming, palaceOf,
} from "./constants.js";

let TEXTS = null;

export function setTexts(texts) {
  TEXTS = texts;
}

export function hasTexts() {
  return !!TEXTS;
}

export class Hexagram {
  /* lines: 长度 6 的数组，自下而上，1 阳 0 阴 */
  constructor(lines) {
    const l = Array.from(lines);
    if (l.length !== 6 || l.some((v) => v !== 0 && v !== 1)) {
      throw new Error(`非法卦线: ${l}`);
    }
    this.lines = l;
    this.id = LINES_TO_ID.get(l.join(""));
    const info = HEX_INFO[this.id];
    this.name = info.name;
    this.fullName = info.full_name;
    this.lower = info.lower;
    this.upper = info.upper;
    this.symbol = info.symbol;
    const [palace, palacePos, shi, ying] = palaceOf(l);
    this.palace = palace;
    this.palacePos = palacePos;
    this.shi = shi;
    this.ying = ying;
    this.palaceElement = BAGUA[palace].wuxing;
    this.palaceGuaming = palaceGuaming(l);
    if (!TEXTS) throw new Error("卦爻辞数据未加载（setTexts）");
    const text = TEXTS[String(this.id)];
    this.guaci = text.guaci;
    this.yaoci = {};
    text.yaoci.forEach((y) => { this.yaoci[y.pos] = y; });
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      full_name: this.fullName,
      symbol: this.symbol,
      lines: [...this.lines],
      lower: this.lower,
      upper: this.upper,
      lower_xiang: BAGUA[this.lower].xiang,
      upper_xiang: BAGUA[this.upper].xiang,
      wuxing: `${BAGUA[this.upper].xiang}${BAGUA[this.lower].xiang}`,
      palace: this.palace,
      palace_name: `${this.palace}宫`,
      palace_element: this.palaceElement,
      palace_guaming: this.palaceGuaming,
      shi: this.shi,
      ying: this.ying,
      guaci: this.guaci,
      yaoci: Object.keys(this.yaoci).map(Number).sort((a, b) => a - b)
        .map((p) => this.yaoci[p]),
    };
  }

  changed(positions) {
    const lines = [...this.lines];
    positions.forEach((p) => { lines[p] = 1 - lines[p]; });
    return new Hexagram(lines);
  }

  /* 互卦：二三四爻为下互，三四五爻为上互 */
  mutual() {
    const l = this.lines;
    return new Hexagram([l[1], l[2], l[3], l[2], l[3], l[4]]);
  }

  /* 初四、二五、三上三对支全冲/全合 */
  chonghe() {
    const pairs = [0, 1, 2].map((i) => [this.lineGz(i)[1], this.lineGz(i + 3)[1]]);
    return [
      pairs.every(([a, b]) => CHONG[a] === b),
      pairs.every(([a, b]) => LIUHE[a] === b),
    ];
  }

  /* 本宫纯卦（查伏神用） */
  purePalace() {
    const lines = BAGUA[this.palace].lines;
    return new Hexagram([...lines, ...lines]);
  }

  lineGz(pos) {
    const trigram = pos < 3 ? this.lower : this.upper;
    return najiaGz(trigram, pos % 3, pos >= 3);
  }

  lineQin(pos) {
    const gz = this.lineGz(pos);
    return liuqin(this.palaceElement, ZHI_WUXING[gz[1]]);
  }

  lineQinByPalace(pos, palaceElement) {
    const gz = this.lineGz(pos);
    return liuqin(palaceElement, ZHI_WUXING[gz[1]]);
  }

  /* 本卦所缺之六亲（需查伏神） */
  missingQin() {
    const present = new Set([0, 1, 2, 3, 4, 5].map((p) => this.lineQin(p)));
    return LIUQIN_NAMES.filter((q) => !present.has(q));
  }

  /* 伏神表：{所缺六亲: {pos, gz, qin}}，取本宫纯卦对应爻 */
  fuShen() {
    const result = {};
    const pure = this.purePalace();
    this.missingQin().forEach((q) => {
      for (let p = 0; p < 6; p += 1) {
        if (pure.lineQin(p) === q) {
          result[q] = { pos: p + 1, gz: pure.lineGz(p), qin: q };
          break;
        }
      }
    });
    return result;
  }
}

export function zhiLabel(zhi) {
  return `${zhi}${DIZHI.indexOf(zhi) + 1}`;
}
