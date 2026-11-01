# -*- coding: utf-8 -*-
"""核心引擎正确性测试（不含 HTTP）。

运行: python test_core.py
覆盖：八宫世应全表、纳甲、六亲、六神、伏神、旬空、六冲六合、
梅花「观梅占」经典案例、规则解读可运行性。
"""
import sys
from datetime import datetime

from core.constants import CATEGORIES, liushen, xunkong
from core.hexagram import HEX_INFO, Hexagram
from core.liuyao import paipan as liuyao_paipan
from core.meihua import paipan as meihua_paipan

PASS = FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  {detail}")


# ---------------- 八宫卦序全表（京房） ----------------
PALACE_EXPECT = {
    "乾": ["乾为天", "天风姤", "天山遁", "天地否", "风地观", "山地剥", "火地晋", "火天大有"],
    "坎": ["坎为水", "水泽节", "水雷屯", "水火既济", "泽火革", "雷火丰", "地火明夷", "地水师"],
    "艮": ["艮为山", "山火贲", "山天大畜", "山泽损", "火泽睽", "天泽履", "风泽中孚", "风山渐"],
    "震": ["震为雷", "雷地豫", "雷水解", "雷风恒", "地风升", "水风井", "泽风大过", "泽雷随"],
    "巽": ["巽为风", "风天小畜", "风火家人", "风雷益", "天雷无妄", "火雷噬嗑", "山雷颐", "山风蛊"],
    "离": ["离为火", "火山旅", "火风鼎", "火水未济", "山水蒙", "风水涣", "天水讼", "天火同人"],
    "坤": ["坤为地", "地雷复", "地泽临", "地天泰", "雷天大壮", "泽天夬", "水天需", "水地比"],
    "兑": ["兑为泽", "泽水困", "泽地萃", "泽山咸", "水山蹇", "地山谦", "雷山小过", "雷泽归妹"],
}
SHI_EXPECT = {0: 6, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 4, 7: 3}

print("== 八宫卦序与世应 ==")
for palace, names in PALACE_EXPECT.items():
    for pos, full in enumerate(names):
        h = next(h for h in HEX_INFO.values() if h["full_name"] == full)
        hx = Hexagram(h["lines"])
        ok = (hx.palace == palace and hx.palace_pos == pos and hx.shi == SHI_EXPECT[pos]
              and hx.ying == ((SHI_EXPECT[pos] + 2) % 6) + 1)
        check(f"{full} -> {palace}宫{pos}世{SHI_EXPECT[pos]}", ok,
              f"实得 {hx.palace}宫{hx.palace_pos} 世{hx.shi}应{hx.ying}")

# ---------------- 纳甲与六亲（乾为天） ----------------
print("== 纳甲六亲（乾为天） ==")
qian = Hexagram((1, 1, 1, 1, 1, 1))
expect = [("甲子", "子孙"), ("甲寅", "妻财"), ("甲辰", "父母"),
          ("壬午", "官鬼"), ("壬申", "兄弟"), ("壬戌", "父母")]
for i, (gz, qin) in enumerate(expect):
    check(f"乾{i + 1}爻 {qin}{gz}", qian.line_gz(i) == gz and qian.line_qin(i) == qin,
          f"实得 {qian.line_gz(i)} {qian.line_qin(i)}")

# 坤卦纳乙癸
kun = Hexagram((0, 0, 0, 0, 0, 0))
check("坤初爻乙未", kun.line_gz(0) == "乙未", kun.line_gz(0))
check("坤上爻癸酉", kun.line_gz(5) == "癸酉", kun.line_gz(5))

# ---------------- 六神 ----------------
print("== 六神 ==")
check("甲日起青龙", liushen("甲", 0) == "青龙")
check("甲日三爻勾陈", liushen("甲", 2) == "勾陈", liushen("甲", 2))
check("己日起螣蛇", liushen("己", 0) == "螣蛇", liushen("己", 0))
check("壬日起玄武", liushen("壬", 0) == "玄武", liushen("壬", 0))
check("丙日二爻勾陈", liushen("丙", 1) == "勾陈", liushen("丙", 1))

# ---------------- 旬空 ----------------
print("== 旬空 ==")
for day, kong in [("甲子", "戌亥"), ("癸酉", "戌亥"), ("甲戌", "申酉"),
                  ("壬午", "申酉"), ("甲申", "午未"), ("癸巳", "午未"),
                  ("甲午", "辰巳"), ("乙巳", "寅卯"), ("甲辰", "寅卯"),
                  ("甲寅", "子丑"), ("癸亥", "子丑")]:
    check(f"{day}旬空{kong}", xunkong(day) == kong, xunkong(day))

# ---------------- 伏神（天风姤缺妻财） ----------------
print("== 伏神 ==")
gou = Hexagram(HEX_INFO[44]["lines"])   # 天风姤，乾宫一世
fu = gou.fu_shen()
check("姤缺妻财，伏二爻甲寅", fu.get("妻财") == {"pos": 2, "gz": "甲寅", "qin": "妻财"},
      str(fu))

# ---------------- 六冲卦 / 六合卦 ----------------
print("== 六冲六合 ==")
for full, expect_chong, expect_he in [
        ("乾为天", True, False), ("坎为水", True, False), ("雷天大壮", True, False),
        ("天雷无妄", True, False), ("地天泰", False, True), ("天地否", False, True),
        ("地雷复", False, True), ("地泽临", False, False), ("水泽节", False, True),
        ("火山旅", False, True), ("山火贲", False, True), ("泽水困", False, True)]:
    h = next(h for h in HEX_INFO.values() if h["full_name"] == full)
    chong, he = Hexagram(h["lines"]).chonghe()
    check(f"{full} 冲={expect_chong} 合={expect_he}",
          chong == expect_chong and he == expect_he, f"实得 冲={chong} 合={he}")

# ---------------- 梅花「观梅占」（辰年12月17日申时） ----------------
print("== 梅花观梅占 ==")
# 辰年: 辰支序数5；十二月、十七日、申时(序数9)
# 上卦=(5+12+17)%8=2 兑；下卦=(34+9)%8=3 离；动爻=43%6=1
# 本卦泽火革，变卦泽山咸，体兑金，用离火，用克体
dt = datetime(2024, 5, 25, 16, 0)  # 具体时刻仅取历法结构，下面直接验证起卦数
from core.calendar_utils import TimeInfo  # noqa: E402
from core.meihua import qigua  # noqa: E402

class FakeTI(TimeInfo):
    """伪造辰年十二月十七日申时的历法数据以复现观梅占"""
    def __init__(self):
        self.lunar = "甲辰年十二月十七日申时"
        self.year_gz = "甲辰"
        self.month_gz = "丙寅"
        self.day_gz = "戊申"
        self.hour_gz = "庚申"
        self.hour_zhi = "申"
        self.lunar_month = 12
        self.lunar_day = 17
        self.lunar_year = 2024
        self.month_jian = "寅"
        self.day_zhi = "申"
        self.xun_kong = "寅卯"
        self.month_element = "木"
        self.lunar_str = "农历甲辰年十二月十七申时"

fake = FakeTI()
upper, lower, dong, _ = qigua(fake, "time")
check("观梅占 上卦兑", upper == "兑", upper)
check("观梅占 下卦离", lower == "离", lower)
check("观梅占 动爻初", dong == 1, dong)

mh = meihua_paipan(datetime(2024, 5, 25, 16, 0), mode="number", n1=10, n2=3,
                   question="观梅占复现")
check("数字卦 10/3 -> 泽火革", mh["ben"]["full_name"] == "泽火革", mh["ben"]["full_name"])
check("初爻动变泽山咸", mh["bian"]["full_name"] == "泽山咸", mh["bian"]["full_name"])
check("体卦兑金(上)", mh["ti"]["gua"] == "兑" and mh["ti"]["wuxing"] == "金")
check("用卦离火(下)", mh["yong"]["gua"] == "离" and mh["yong"]["wuxing"] == "火")
check("用克体（凶象）", mh["interpretation"]["ti_yong_relation"] == "yong_ke_ti")

# ---------------- 伏神（风水涣缺官鬼、妻财） ----------------
print("== 伏神（涣卦） ==")
huan = Hexagram(HEX_INFO[59]["lines"])   # 风水涣，离宫五世
fu = huan.fu_shen()
check("涣缺官鬼伏三爻己亥", fu.get("官鬼") == {"pos": 3, "gz": "己亥", "qin": "官鬼"},
      str(fu))
check("涣缺妻财伏四爻己酉", fu.get("妻财") == {"pos": 4, "gz": "己酉", "qin": "妻财"},
      str(fu))

# ---------------- 六爻完整排盘冒烟 ----------------
print("== 六爻排盘 ==")
# 天火同人（离下乾上），三爻老阳发动 -> 天雷无妄
plate = liuyao_paipan([7, 8, 9, 7, 7, 7], datetime(2026, 10, 24, 14, 30),
                      question="测试", category="qiucai")
check("本卦天火同人", plate["ben"]["full_name"] == "天火同人", plate["ben"]["full_name"])
check("同人属离宫归魂", plate["ben"]["palace"] == "离" and plate["ben"]["palace_guaming"] == "归魂卦")
check("世三应六", plate["ben"]["shi"] == 3 and plate["ben"]["ying"] == 6)
check("三爻老阳发动", plate["rows"][2]["dong"] and plate["rows"][2]["dong_mark"] == "O")
check("变卦天雷无妄", plate["bian"]["full_name"] == "天雷无妄", plate["bian"]["full_name"])
check("三爻为世爻", plate["rows"][2]["shi"] is True)
check("六爻上爻为应爻", plate["rows"][5]["ying"] is True)
check("解读有评分", isinstance(plate["interpretation"]["score"], int)
      and 5 <= plate["interpretation"]["score"] <= 95)
check("解读段落齐全", {p["title"] for p in plate["interpretation"]["paragraphs"]} >=
      {"用神", "旺衰与动静", "世应与卦象", "综合判断"})
check("乾卦九二爻辞已勘误",
      "见龙在田" in Hexagram((1,) * 6).yaoci[2]["text"],
      Hexagram((1,) * 6).yaoci[2]["text"])

# 全静卦
plate2 = liuyao_paipan([7, 8, 7, 8, 7, 8], datetime(2026, 10, 24, 14, 30))
check("六爻安静无变卦", plate2["bian"] is None and plate2["dong_positions"] == [])

# 用神不上卦（伏神路径）：风水涣缺官鬼，以 shiye（用神官鬼）问之
plate3 = liuyao_paipan([8, 7, 8, 8, 7, 7], datetime(2026, 10, 24, 14, 30),
                       category="shiye")
check("涣卦无官鬼走伏神", plate3["interpretation"]["yongshen"]["mode"] == "fucang",
      plate3["interpretation"]["yongshen"])

# 每个类别都能跑通
for cat in CATEGORIES:
    try:
        liuyao_paipan([7, 9, 8, 6, 7, 8], datetime(2026, 10, 24, 14, 30), category=cat)
        meihua_paipan(datetime(2026, 10, 24, 14, 30), category=cat)
        check(f"类别 {cat} 排盘通过", True)
    except Exception as e:  # noqa: BLE001
        check(f"类别 {cat} 排盘通过", False, str(e))

# 随机 200 卦不崩
import random  # noqa: E402
random.seed(42)
try:
    for _ in range(200):
        vals = [random.choice([6, 7, 8, 9]) for _ in range(6)]
        dt_r = datetime(2026, random.randint(1, 12), random.randint(1, 28),
                        random.randint(0, 23), random.randint(0, 59))
        p = liuyao_paipan(vals, dt_r)
        assert p["interpretation"]["score"]
        p2 = meihua_paipan(dt_r, mode="number",
                           n1=random.randint(1, 999), n2=random.randint(1, 999))
        assert p2["interpretation"]["score"]
    check("随机 200 次排盘无异常", True)
except Exception as e:  # noqa: BLE001
    check("随机 200 次排盘无异常", False, str(e))

print(f"\n共 {PASS + FAIL} 项：通过 {PASS}，失败 {FAIL}")
sys.exit(1 if FAIL else 0)
