# -*- coding: utf-8 -*-
"""六爻规则解读引擎：用神旺衰生克 -> 评分与解读文本。"""
from .constants import CHONG, CATEGORIES, LIUHE, ke, sheng

WANG_SCORE = {"旺": 15, "相": 10, "休": -5, "囚": -10, "死": -15}

VERDICTS = [
    (75, "大吉", "卦象显示时机与人事俱佳，宜积极进取。"),
    (60, "吉", "卦象偏向顺利，可以着手去办，注意细节即可。"),
    (45, "平", "卦象吉凶参半，事可成但多波折，宜缓图不宜急取。"),
    (30, "不顺", "卦象阻碍较多，宜退守蓄力，暂不宜强求。"),
    (0, "凶", "卦象明显不利，此时举动多有掣肘，建议暂缓计划。"),
]


def _verdict(score):
    for th, name, desc in VERDICTS:
        if score >= th:
            return name, desc
    return "凶", "卦象明显不利，此时举动多有掣肘，建议暂缓计划。"


def _row_desc(r):
    cn = "一二三四五六"[r["pos"] - 1]
    return f"{cn}爻·{r['qin']}{r['gz']}{r['wuxing']}"


def _pick_yongshen(rows, qin):
    """用神多现：优先取动爻，次取临世应，再次取首现"""
    cands = [r for r in rows if r["qin"] == qin]
    if not cands:
        return None
    for pred in (lambda r: r["dong"], lambda r: r["shi"] or r["ying"]):
        got = [r for r in cands if pred(r)]
        if got:
            return got[0]
    return cands[0]


def interpret_liuyao(plate):
    rows = plate["rows"]
    cat = CATEGORIES.get(plate["category"], CATEGORIES["zonghe"])
    yong_qin = cat["yongshen"]
    score = 50
    factors = []

    def add(name, delta, desc):
        nonlocal score
        score += delta
        factors.append({"name": name, "delta": delta, "desc": desc})

    shi_r = next(r for r in rows if r["shi"])
    ying_r = next(r for r in rows if r["ying"])

    # ---------- 定用神 ----------
    if yong_qin == "世爻":
        ys, mode = shi_r, "shiyao"
        ys_desc = f"以世爻为用神，即 {_row_desc(ys)}（自占以世为己身）"
    else:
        ys = _pick_yongshen(rows, yong_qin)
        if ys is not None:
            mode = "present"
            extra = "，用神发动" if ys["dong"] else ""
            ys_desc = f"以{yong_qin}为用神，即 {_row_desc(ys)}{extra}"
        else:
            mode = "fucang"
            ys = shi_r
            ys_desc = f"卦中{yong_qin}不上卦，以世爻兼看，另查伏神"

    yong_info = {
        "qin": yong_qin, "mode": mode,
        "found": mode == "present" or mode == "shiyao",
        "pos": ys["pos"], "gz": ys["gz"], "wuxing": ys["wuxing"],
        "dong": ys["dong"], "wang": ys["yue_wang"], "kong": ys["kong"],
        "desc": ys_desc,
    }

    # ---------- 用神分析（上卦 / 世爻） ----------
    if mode in ("present", "shiyao"):
        w = ys["yue_wang"]
        add(f"用神{w}于月建", WANG_SCORE[w],
            f"用神{ys['gz']}{ys['wuxing']}于本月（{plate['time_info']['month_jian']}月建"
            f"{plate['time_info']['month_element']}）处「{w}」地。")
        if ys["yue_po"]:
            add("用神月破", -12, "用神与月建相冲，是为月破，事体多有损伤。")
        if ys["ri_sheng"]:
            add("日辰生用神", 10, "日辰生扶用神，得当日天时之助。")
        if ys["ri_ke"]:
            add("日辰克用神", -12, "日辰克制用神，当日人事多有阻力。")
        if ys["ri_bi"]:
            add("日辰比扶", 6, "日辰与用神同气，力量增强。")
        if ys["ri_he"]:
            add("日辰合用神", 4, "日辰与用神相合，事有牵引留连之象。")
        if ys["ri_chong"]:
            if w in ("旺", "相"):
                add("日辰冲动（暗动）", 0, "用神旺相逢冲为暗动，静中有变，事将发动。")
            else:
                add("日辰冲用神", -8, "用神休囚又被日辰冲散，根基不稳。")
        if ys["kong"]:
            if w in ("旺", "相"):
                add("用神空亡（旺相）", -5, "用神旬空但旺相，空而不败，出旬可成。")
            else:
                add("用神空亡", -10, "用神落旬空又失令，心愿一时难遂，待出空之期。")

        # 其他动爻对用神的生克
        for r in rows:
            if not r["dong"] or r is ys:
                continue
            el, yel = r["wuxing"], ys["wuxing"]
            if sheng(el, yel):
                add(f"动爻生用神（{r['qin']}）", 8,
                    f"{_row_desc(r)} 发动，生扶用神，为得力之助。")
            elif ke(el, yel):
                add(f"动爻克用神（{r['qin']}）", -8,
                    f"{_row_desc(r)} 发动，克制用神，是事中之阻。")
            elif el == yel:
                add(f"动爻比扶用神（{r['qin']}）", 4,
                    f"{_row_desc(r)} 发动，与用神同气连枝。")

        # 用神自动之化
        if ys["dong"] and ys.get("bian"):
            b = ys["bian"]
            if b["huisheng"]:
                add("化回头生", 8, f"动化{b['gz']}{b['wuxing']}回头生，愈动愈旺。")
            if b["huike"]:
                add("化回头克", -10, f"动化{b['gz']}{b['wuxing']}回头克，自生变数。")
            if b["jintui"] == "进神":
                add("化进神", 8, "动而化进神，事势步步向前。")
            if b["jintui"] == "退神":
                add("化退神", -6, "动而化退神，事势渐有退意。")
            if b["zhi"] in set(plate["time_info"]["xun_kong"]):
                add("化入空亡", -6, "动而变爻空亡，变化落空。")

    # ---------- 用神伏藏 ----------
    elif mode == "fucang":
        fu = plate["fu_shen"].get(yong_qin)
        if fu:
            add("用神伏藏", -8,
                f"{yong_qin}不上卦，{fu['qin']}{fu['gz']}伏于"
                f"{'一二三四五六'[fu['pos'] - 1]}爻之下，事不显达。")
            if fu.get("ri_sheng") or fu.get("yue_sheng"):
                add("伏神得日月生扶", 8, "伏神得日月生扶，出伏之日事可为。")
            if fu.get("ri_ke") or fu.get("yue_ke"):
                add("伏神受日月克", -8, "伏神受日月克伤，纵出亦难有力。")
            fei = rows[fu["pos"] - 1]
            if ke(fei["wuxing"], fu["wuxing"]):
                add("飞神克伏", -6, f"飞神{fei['gz']}克伏神，压制重重。")
            elif sheng(fei["wuxing"], fu["wuxing"]):
                add("飞神生伏", 4, f"飞神{fei['gz']}生伏神，暗中相扶。")

    # ---------- 世应关系 ----------
    if sheng(ying_r["wuxing"], shi_r["wuxing"]):
        add("应爻生世", 5, "应爻生世，对方（他人、环境）有情于我。")
    elif ke(ying_r["wuxing"], shi_r["wuxing"]):
        add("应爻克世", -5, "应爻克世，对方于我有压，交涉须谨慎。")
    if LIUHE[ying_r["zhi"]] == shi_r["zhi"]:
        add("世应六合", 4, "世应相合，彼此投契，事可磨合而成。")
    elif CHONG[ying_r["zhi"]] == shi_r["zhi"]:
        add("世应六冲", -4, "世应相冲，双方情谊有隙，多生反复。")
    if shi_r["kong"]:
        add("世爻空亡", -4, "世爻空亡，己心未定或自身状态不足。")

    # ---------- 卦之冲合 ----------
    ben, bian = plate["ben"], plate["bian"]
    if ben.get("liuchong"):
        add("六冲卦", -4, "本卦为六冲卦，事多散乱急变，近事可成久事难聚。")
    if ben.get("liuhe"):
        add("六合卦", 4, "本卦为六合卦，人事和合，事迟而终成。")
    if bian and bian.get("liuchong"):
        add("卦变六冲", -4, "变卦六冲，结局恐有散局之象。")
    if bian and bian.get("liuhe"):
        add("卦变六合", 4, "变卦六合，事至后期渐趋圆满。")

    # ---------- 类别要点 ----------
    _category_factors(add, rows, plate, cat, ys, mode)

    score = max(5, min(95, score))
    name, desc = _verdict(score)

    paragraphs = [
        {"title": "用神", "text": ys_desc + "。"},
        {"title": "旺衰与动静", "text": _par_wangshuai(plate, ys, mode)},
        {"title": "世应与卦象", "text": _par_shiying(plate)},
        {"title": "事类要点", "text": cat["hint"]},
        {"title": "综合判断", "text": f"综合诸因素评分 {score}/100，属「{name}」——{desc}"},
    ]
    return {
        "yongshen": yong_info,
        "score": score,
        "verdict": name,
        "verdict_desc": desc,
        "factors": factors,
        "paragraphs": paragraphs,
    }


def _category_factors(add, rows, plate, cat, ys, mode):
    """类别专属因素"""
    key = plate["category"]

    def find(qin):
        for r in rows:
            if r["qin"] == qin:
                return r
        return None

    if key in ("qiucai", "shiwu"):          # 财物类：子孙为源，兄弟为劫
        zi, xiong = find("子孙"), find("兄弟")
        if zi and zi["dong"] and mode == "present" and sheng(zi["wuxing"], ys["wuxing"]):
            add("子孙发动生财", 6, "子孙为财之原神，发动生财，财源不断。")
        if xiong and xiong["dong"] and mode == "present" and ke(xiong["wuxing"], ys["wuxing"]):
            add("兄弟发动克财", -6, "兄弟为劫财之神，发动克财，谨防破耗分利。")
    elif key in ("shiye", "hunyin_f", "kaoshi"):   # 官鬼/文书类
        fumu = find("父母")
        if fumu and fumu["dong"]:
            add("父母发动生助", 4, "父母为文书提携之神，发动于事有扶。")
        zi = find("子孙")
        if zi and zi["dong"]:
            add("子孙动克官鬼", -6,
                "子孙发动克伤官鬼，于求职官考、女问姻缘皆非吉兆（占病占讼反喜之）。")
    elif key == "jiankang":                  # 健康：官鬼为病、子孙为药
        gui, zi = find("官鬼"), find("子孙")
        if gui:
            if gui["dong"] or gui["yue_wang"] in ("旺", "相"):
                add("官鬼旺动（病症深）", -8, "官鬼旺相发动，病象明显缠绵。")
            elif gui["yue_wang"] in ("死", "囚"):
                add("官鬼衰弱（病易去）", 6, "官鬼休囚，病症虽显而不深。")
        if zi:
            if zi["dong"] or zi["yue_wang"] in ("旺", "相"):
                add("子孙旺相（医药得力）", 6, "子孙为医药福德之神，旺相发动，调治有效。")
            elif zi["yue_wang"] in ("死", "囚"):
                add("子孙衰弱（药力不济）", -6, "子孙休囚，医药之力一时难显。")


def _par_wangshuai(plate, ys, mode):
    if mode == "fucang":
        return "用神不上卦而伏于爻下，事机未显，须待引拔之期（多看日月冲飞、伏神出透之时）。"
    parts = [f"用神{ys['gz']}{ys['wuxing']}处月建「{ys['yue_wang']}」地"]
    rel = []
    if ys["ri_sheng"]:
        rel.append("得日辰生扶")
    if ys["ri_ke"]:
        rel.append("受日辰克制")
    if ys["ri_chong"]:
        rel.append("被日辰冲")
    if ys["kong"]:
        rel.append("落旬空")
    if ys["dong"]:
        rel.append("自身发动")
    if rel:
        parts.append("，" + "、".join(rel))
    n_dong = len(plate["dong_positions"])
    tail = ("，六爻安静，事以缓图" if n_dong == 0 else
            "，动静有常" if n_dong <= 2 else "，动爻既多，变化急促")
    parts.append(f"。动爻共 {n_dong} 处{tail}")
    return "".join(parts)


def _par_shiying(plate):
    rows = plate["rows"]
    shi_r = next(r for r in rows if r["shi"])
    ying_r = next(r for r in rows if r["ying"])
    ben = plate["ben"]
    s = (f"世居{'一二三四五六'[shi_r['pos'] - 1]}爻（{shi_r['qin']}{shi_r['gz']}），"
         f"应在{'一二三四五六'[ying_r['pos'] - 1]}爻（{ying_r['qin']}{ying_r['gz']}）。"
         f"本卦{ben['full_name']}，属{ben['palace_name']}{ben['palace_element']}"
         f"之{ben['palace_guaming']}。")
    if plate["bian"]:
        s += f"动而之{plate['bian']['full_name']}，事有后变之机。"
    return s
