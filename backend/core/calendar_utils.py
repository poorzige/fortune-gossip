# -*- coding: utf-8 -*-
"""历法工具：基于 lunar-python，输出排盘所需的干支时令信息。"""
from datetime import datetime

from lunar_python import Solar

from .constants import DIZHI, ZHI_WUXING, xunkong


class TimeInfo:
    """一次起卦时刻的历法信息。"""

    def __init__(self, dt: datetime):
        solar = Solar.fromYmdHms(dt.year, dt.month, dt.day,
                                 dt.hour, dt.minute, 0)
        self.lunar = solar.getLunar()
        self.year_gz = self.lunar.getYearInGanZhi()
        self.month_gz = self.lunar.getMonthInGanZhi()
        self.day_gz = self.lunar.getDayInGanZhi()
        self.hour_gz = self.lunar.getTimeInGanZhi()
        self.hour_zhi = self.lunar.getTimeZhi()            # 时支，如 "未"
        self.lunar_month = self.lunar.getMonth()           # 农历月数（闰月为负）
        self.lunar_day = self.lunar.getDay()               # 农历日数 1-30
        self.lunar_year = self.lunar.getYear()
        self.month_jian = self.month_gz[1]                 # 月建（月支）
        self.day_zhi = self.day_gz[1]                      # 日辰（日支）
        self.xun_kong = xunkong(self.day_gz)               # 旬空二支
        self.month_element = ZHI_WUXING[self.month_jian]   # 月令五行
        self.dt = dt
        self.lunar_str = (f"农历{self.lunar.getYearInChinese()}年"
                          f"{self.lunar.getMonthInChinese()}月"
                          f"{self.lunar.getDayInChinese()}{self.hour_zhi}时")

    def year_zhi_num(self) -> int:
        """年支序数：子1 丑2 …… 亥12（梅花起卦用）"""
        return DIZHI.index(self.year_gz[1]) + 1

    def hour_num(self) -> int:
        """时辰序数：子1 丑2 …… 亥12"""
        return DIZHI.index(self.hour_zhi) + 1

    def to_dict(self):
        return {
            "datetime": self.dt.strftime("%Y-%m-%d %H:%M"),
            "lunar": self.lunar_str,
            "year_gz": self.year_gz, "month_gz": self.month_gz,
            "day_gz": self.day_gz, "hour_gz": self.hour_gz,
            "hour_zhi": self.hour_zhi,
            "month_jian": self.month_jian, "day_zhi": self.day_zhi,
            "month_element": self.month_element,
            "xun_kong": self.xun_kong,
        }


def now() -> datetime:
    return datetime.now()
