# -*- coding: utf-8 -*-
"""梅花易数：时间/数字起卦，体用互变，生克断吉凶。"""
from datetime import datetime

from .calendar_utils import TimeInfo
from .constants import BAGUA, CATEGORIES, ke, sheng, wangshuai
from .hexagram import Hexagram

# 先天卦数：乾一兑二离三震四，巽五坎六艮七坤八
NUM_TO_GUA = {v["num"]: k for k, v in BAGUA.items()}


def _gua_info(name):
    g = BAGUA[name]
    return {"gua": name, "xiang": g["xiang"], "wuxing": g["wuxing"],
            "num": g["num"]}


def qigua(time_info, mode="time", n1=None, n2=None):
    """起卦，返回 (上卦名, 下卦名, 动爻1-6, 起卦说明)"""
    if mode == "number":
        if not (isinstance(n1, int) and isinstance(n2, int)) or n1 <= 0 or n2 <= 0:
            raise ValueError("数字起卦须提供两个正整数")
        upper = n1 % 8 or 8
        lower = n2 % 8 or 8
        dong = (n1 + n2) % 6 or 6
        desc = (f"以数起卦：第一数 {n1} 除八余 {upper} 为上卦（{NUM_TO_GUA[upper]}），"
                f"第二数 {n2} 除八余 {lower} 为下卦（{NUM_TO_GUA[lower]}），"
                f"两数之和 {n1 + n2} 除六余 {dong} 为动爻。")
        return NUM_TO_GUA[upper], NUM_TO_GUA[lower], dong, desc

    y = time_info.year_zhi_num()
    m = abs(time_info.lunar_month)
    d = time_info.lunar_day
    h = time_info.hour_num()
    s1 = y + m + d
    s2 = s1 + h
    upper = s1 % 8 or 8
    lower = s2 % 8 or 8
    dong = s2 % 6 or 6
    desc = (f"以时起卦：{time_info.lunar_str}，年支数 {y} + 月 {m} + 日 {d} = {s1}，"
            f"除八余 {upper} 为上卦（{NUM_TO_GUA[upper]}）；加时辰数 {h} 得 {s2}，"
            f"除八余 {lower} 为下卦（{NUM_TO_GUA[lower]}）；"
            f"{s2} 除六余 {dong} 为动爻。")
    return NUM_TO_GUA[upper], NUM_TO_GUA[lower], dong, desc


def paipan(dt, question="", category="zonghe", mode="time", n1=None, n2=None):
    """梅花易数排盘。mode: 'time' 时间起卦 / 'number' 数字起卦"""
    if not isinstance(dt, datetime):
        dt = datetime.now()
    time_info = TimeInfo(dt)
    upper, lower, dong, qigua_desc = qigua(time_info, mode, n1, n2)

    ben = Hexagram(BAGUA[lower]["lines"] + BAGUA[upper]["lines"])
    dong_i = dong - 1
    bian = ben.changed([dong_i])
    hu = ben.mutual()

    # 体用：动爻所在之卦为「用」，静而不动之卦为「体」
    dong_in_lower = dong_i < 3
    ti_gua = upper if dong_in_lower else lower
    yong_gua = lower if dong_in_lower else upper
    ti = _gua_info(ti_gua)
    yong = _gua_info(yong_gua)
    ti["position"] = "上卦" if dong_in_lower else "下卦"
    yong["position"] = "下卦" if dong_in_lower else "上卦"

    cat = CATEGORIES.get(category, CATEGORIES["zonghe"])
    dong_yaoci = [ben.yaoci[dong]] if dong in ben.yaoci else []

    plate = {
        "method": "meihua",
        "mode": mode,
        "question": question,
        "category": category,
        "category_label": cat["label"],
        "category_hint": cat["hint"],
        "cast_time": dt.strftime("%Y-%m-%d %H:%M"),
        "time_info": time_info.to_dict(),
        "qigua": {"desc": qigua_desc, "dong": dong, "mode": mode,
                  "n1": n1, "n2": n2},
        "ben": ben.summary(),
        "hu": hu.summary(),
        "bian": bian.summary(),
        "ti": ti,
        "yong": yong,
        "dong_yaoci": dong_yaoci,
    }
    plate["interpretation"] = _interpret(plate, time_info, ben, hu, bian, ti, yong)
    return plate


_REL_TEXT = {
    "yong_sheng_ti": "用生体，外境来生扶自己，主进益之喜",
    "ti_ke_yong": "体克用，我制外境，费力而可成，如逆水行舟得桨",
    "bihesh": "体用比和，内外同气，事事谐顺",
    "ti_sheng_yong": "体生用，自我耗泄付出，劳而少功",
    "yong_ke_ti": "用克体，外境克伤自己，主阻滞不顺",
}
_REL_SCORE = {"yong_sheng_ti": 20, "ti_ke_yong": 8, "bihesh": 10,
              "ti_sheng_yong": -10, "yong_ke_ti": -20}


def _relation(yong_el, ti_el):
    if sheng(yong_el, ti_el):
        return "yong_sheng_ti"
    if ke(yong_el, ti_el):
        return "yong_ke_ti"
    if ke(ti_el, yong_el):
        return "ti_ke_yong"
    if sheng(ti_el, yong_el):
        return "ti_sheng_yong"
    return "bihesh"


def _interpret(plate, time_info, ben, hu, bian, ti, yong):
    score = 50
    factors = []

    def add(name, delta, desc):
        nonlocal score
        score += delta
        factors.append({"name": name, "delta": delta, "desc": desc})

    ti_el = ti["wuxing"]

    # 体用生克（大纲）
    rel = _relation(yong["wuxing"], ti_el)
    add(f"体用：{_REL_TEXT[rel].split('，')[0]}", _REL_SCORE[rel],
        f"体卦{ti['gua']}（{ti['wuxing']}）为{'上' if ti['position'] == '上卦' else '下'}卦，"
        f"用卦{yong['gua']}（{yong['wuxing']}）为"
        f"{'上' if yong['position'] == '上卦' else '下'}卦。{_REL_TEXT[rel]}。")

    # 互卦（中间过程）：互卦二重，分别与体论生克
    hu_parts = []
    for side, gua_name in (("下互", hu.lower), ("上互", hu.upper)):
        el = BAGUA[gua_name]["wuxing"]
        r = _relation(el, ti_el)
        d = {"yong_sheng_ti": 4, "ti_ke_yong": 2, "bihesh": 2,
             "ti_sheng_yong": -3, "yong_ke_ti": -4}[r]
        add(f"互卦{side}{gua_name}{el}（{_REL_TEXT[r].split('，')[0]}）", d,
            f"互卦{side}{gua_name}属{el}，{_REL_TEXT[r]}，此为事之中段。")
        hu_parts.append(f"{side}{gua_name}（{el}）")

    # 变卦（结局）：变卦中用卦所变之五行对体
    bian_yong_gua = bian.lower if yong["position"] == "下卦" else bian.upper
    by_el = BAGUA[bian_yong_gua]["wuxing"]
    r2 = _relation(by_el, ti_el)
    d2 = {"yong_sheng_ti": 10, "ti_ke_yong": 4, "bihesh": 6,
          "ti_sheng_yong": -6, "yong_ke_ti": -10}[r2]
    add(f"变卦{bian_yong_gua}{by_el}（{_REL_TEXT[r2].split('，')[0]}）", d2,
        f"用卦变而为{bian_yong_gua}（{by_el}），{_REL_TEXT[r2]}，此为事之归宿。")

    # 体卦旺衰于月令
    w = wangshuai(time_info.month_element, ti_el)
    ws = {"旺": 10, "相": 6, "休": -4, "囚": -8, "死": -12}[w]
    add(f"体卦{w}于时令", ws,
        f"体卦{ti['gua']}属{ti_el}，于月建{time_info.month_jian}"
        f"（{time_info.month_element}）之时处「{w}」地。")

    score = max(5, min(95, score))
    from .interpret import _verdict
    name, desc = _verdict(score)

    paragraphs = [
        {"title": "起卦", "text": plate["qigua"]["desc"]},
        {"title": "体用",
         "text": (f"动爻在{'下' if yong['position'] == '下卦' else '上'}卦，故"
                  f"{yong['position']}（{yong['gua']}，{yong['wuxing']}）为用，"
                  f"{ti['position']}（{ti['gua']}，{ti['wuxing']}）为体。"
                  f"{_REL_TEXT[rel]}。")},
        {"title": "中间过程", "text": f"互卦为{'、'.join(hu_parts)}，观事之中段变化。"},
        {"title": "最终归宿", "text": f"变卦{bian.full_name}，用卦化{bian_yong_gua}，{_REL_TEXT[r2]}。"},
        {"title": "综合判断", "text": f"综合评分 {score}/100，属「{name}」——{desc}"},
    ]
    return {
        "score": score,
        "verdict": name,
        "verdict_desc": desc,
        "factors": factors,
        "paragraphs": paragraphs,
        "ti_yong_relation": rel,
    }
