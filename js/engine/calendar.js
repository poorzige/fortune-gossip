/* 历法：基于 lunar-javascript（与 lunar-python 同作者），输出排盘所需干支时令。
 * 对应 backend/core/calendar_utils.py */

import { DIZHI, ZHI_WUXING, xunkong } from "./constants.js";

function solarOf() {
  const S = globalThis.Solar;
  if (!S) throw new Error("lunar.js 未加载：请先引入 js/vendor/lunar.js");
  return S;
}

const pad = (n) => String(n).padStart(2, "0");

export function formatDateTime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class TimeInfo {
  constructor(dt) {
    const d = dt instanceof Date ? dt : new Date();
    const solar = solarOf().fromYmdHms(
      d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), 0,
    );
    const lunar = solar.getLunar();
    this.lunar = lunar;
    this.yearGz = lunar.getYearInGanZhi();
    this.monthGz = lunar.getMonthInGanZhi();
    this.dayGz = lunar.getDayInGanZhi();
    this.hourGz = lunar.getTimeInGanZhi();
    this.hourZhi = lunar.getTimeZhi();
    this.lunarMonth = lunar.getMonth();   // 农历月数（闰月为负）
    this.lunarDay = lunar.getDay();
    this.lunarYear = lunar.getYear();
    this.monthJian = this.monthGz[1];
    this.dayZhi = this.dayGz[1];
    this.xunKong = xunkong(this.dayGz);              // 旬空二支
    this.monthElement = ZHI_WUXING[this.monthJian];  // 月令五行
    this.dt = d;
    this.lunarStr = `农历${lunar.getYearInChinese()}年`
      + `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}${this.hourZhi}时`;
  }

  /* 年支序数：子1 丑2 …… 亥12（梅花起卦用） */
  yearZhiNum() { return DIZHI.indexOf(this.yearGz[1]) + 1; }

  /* 时辰序数：子1 丑2 …… 亥12 */
  hourNum() { return DIZHI.indexOf(this.hourZhi) + 1; }

  toDict() {
    return {
      datetime: formatDateTime(this.dt),
      lunar: this.lunarStr,
      year_gz: this.yearGz,
      month_gz: this.monthGz,
      day_gz: this.dayGz,
      hour_gz: this.hourGz,
      hour_zhi: this.hourZhi,
      month_jian: this.monthJian,
      day_zhi: this.dayZhi,
      month_element: this.monthElement,
      xun_kong: this.xunKong,
    };
  }
}
