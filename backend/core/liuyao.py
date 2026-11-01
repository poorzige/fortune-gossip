# -*- coding: utf-8 -*-
"""六爻排盘：摇卦六线（6/7/8/9）-> 完整卦盘。"""
from datetime import datetime

from .calendar_utils import TimeInfo
from .constants import (CHONG, CATEGORIES, DIZHI, JIN_SHEN, LIUHE, TUI_SHEN,
                        ZHI_WUXING, ke, liushen, sheng, wangshuai)
from .hexagram import Hexagram

# 6 老阴(动) 7 少阳 8 少阴 9 老阳(动)
YAO_LABELS = {1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上"}


def _yao_label(pos, yin_yang):
    return YAO_LABELS[pos] + ("九" if yin_yang else "六")


def _day_month_relations(zhi, time_info):
    """爻支与日辰、月建的生克冲合关系"""
    ri_zhi = time_info.day_zhi
    yue_zhi = time_info.month_jian
    el = ZHI_WUXING[zhi]
    return {
        "ri_sheng": sheng(ZHI_WUXING[ri_zhi], el),   # 日生爻
        "ri_ke": ke(ZHI_WUXING[ri_zhi], el),          # 日克爻
        "ri_bi": ZHI_WUXING[ri_zhi] == el,            # 日比扶
        "ri_chong": CHONG[ri_zhi] == zhi,             # 日冲
        "ri_he": LIUHE[ri_zhi] == zhi,                # 日合
        "yue_sheng": sheng(ZHI_WUXING[yue_zhi], el),  # 月生爻
        "yue_ke": ke(ZHI_WUXING[yue_zhi], el),        # 月克爻
        "yue_bi": ZHI_WUXING[yue_zhi] == el,          # 月建同行
        "yue_po": CHONG[yue_zhi] == zhi,              # 月破
    }


def paipan(lines, dt, question="", category="zonghe"):
    """六爻排盘。

    lines: 六个值（自下而上），6老阴 / 7少阳 / 8少阴 / 9老阳
    返回完整卦盘 dict（含规则解读）。
    """
    if len(lines) != 6 or any(v not in (6, 7, 8, 9) for v in lines):
        raise ValueError("爻值须为 6/7/8/9 六个")
    if not isinstance(dt, datetime):
        dt = datetime.now()

    time_info = TimeInfo(dt)
    ben = Hexagram(tuple(1 if v in (7, 9) else 0 for v in lines))
    dong_positions = [i for i, v in enumerate(lines) if v in (6, 9)]
    bian = ben.changed(dong_positions) if dong_positions else None
    hu = ben.mutual()
    fu = ben.fu_shen()          # {六亲: {pos, gz, qin}}
    fu_by_pos = {v["pos"]: v for v in fu.values()}   # 按伏藏爻位挂到对应行
    kong_zhis = set(time_info.xun_kong)

    # 伏神的日月生克关系（用神伏藏时参断）
    for v in fu.values():
        zhi = v["gz"][1]
        rel = _day_month_relations(zhi, time_info)
        v["zhi"] = zhi
        v["wuxing"] = ZHI_WUXING[zhi]
        v.update({k: rel[k] for k in ("ri_sheng", "ri_ke", "yue_sheng", "yue_ke")})

    rows = []
    for i in range(6):
        pos = i + 1
        value = lines[i]
        yin_yang = 1 if value in (7, 9) else 0
        dong = value in (6, 9)
        gz = ben.line_gz(i)
        zhi = gz[1]
        qin = ben.line_qin(i)
        rel = _day_month_relations(zhi, time_info)
        row = {
            "pos": pos,
            "label": _yao_label(pos, yin_yang),
            "value": value,
            "yin_yang": yin_yang,
            "dong": dong,
            "dong_mark": ("O" if value == 9 else "X") if dong else None,
            "shen": liushen(time_info.day_gz[0], i),
            "qin": qin,
            "gz": gz, "gan": gz[0], "zhi": zhi,
            "wuxing": ZHI_WUXING[zhi],
            "shi": ben.shi == pos,
            "ying": ben.ying == pos,
            "kong": zhi in kong_zhis,
            "yue_wang": wangshuai(time_info.month_element, ZHI_WUXING[zhi]),
            **rel,
            "fu": fu_by_pos.get(pos),
            "bian": None,
        }
        if dong and bian is not None:
            b_gz = bian.line_gz(i)
            b_zhi = b_gz[1]
            b_el = ZHI_WUXING[b_zhi]
            el = ZHI_WUXING[zhi]
            row["bian"] = {
                "gz": b_gz, "gan": b_gz[0], "zhi": b_zhi,
                "wuxing": b_el,
                "yin_yang": bian.lines[i],
                # 变卦六亲：地支按变卦装，六亲按本卦宫五行断
                "qin": bian.line_qin_by_palace(i, ben.palace_element),
                "label": _yao_label(pos, bian.lines[i]),
                "huisheng": sheng(b_el, el),   # 回头生
                "huike": ke(b_el, el),          # 回头克
                "jintui": ("进神" if (zhi, b_zhi) in JIN_SHEN
                           else "退神" if (zhi, b_zhi) in TUI_SHEN else None),
            }
        rows.append(row)

    cat = CATEGORIES.get(category, CATEGORIES["zonghe"])
    dong_yaoci = [ben.yaoci[p + 1] for p in dong_positions if (p + 1) in ben.yaoci]

    ben_sum = ben.summary()
    ben_sum["liuchong"], ben_sum["liuhe"] = ben.chonghe()
    bian_sum = None
    if bian:
        bian_sum = bian.summary()
        bian_sum["liuchong"], bian_sum["liuhe"] = bian.chonghe()

    plate = {
        "method": "liuyao",
        "question": question,
        "category": category,
        "category_label": cat["label"],
        "category_hint": cat["hint"],
        "cast_time": dt.strftime("%Y-%m-%d %H:%M"),
        "time_info": time_info.to_dict(),
        "lines": list(lines),
        "ben": ben_sum,
        "hu": hu.summary(),
        "bian": bian_sum,
        "rows": rows,                                  # 自下而上，前端倒序展示
        "dong_positions": [p + 1 for p in dong_positions],
        "dong_yaoci": dong_yaoci,
        "fu_shen": fu,
    }

    from .interpret import interpret_liuyao
    plate["interpretation"] = interpret_liuyao(plate)
    return plate
