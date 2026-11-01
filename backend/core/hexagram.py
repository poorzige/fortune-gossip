# -*- coding: utf-8 -*-
"""卦象模型：六爻 -> 卦序、卦宫、世应、互卦、变卦。"""
import json
import os

from .constants import (BAGUA, DIZHI, HEX_INFO, LIUQIN_NAMES, LINES_TO_ID,
                        palace_guaming, palace_of, ZHI_WUXING, liuqin,
                        najia_gz)

_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "data", "hexagram_texts.json")

with open(_DATA_PATH, encoding="utf-8") as _f:
    TEXTS = json.load(_f)


class Hexagram:
    """一个六爻卦象。lines: 六元组，自下而上，1 阳 0 阴。"""

    def __init__(self, lines):
        if len(lines) != 6 or any(v not in (0, 1) for v in lines):
            raise ValueError(f"非法卦线: {lines}")
        self.lines = tuple(lines)
        self.id = LINES_TO_ID[self.lines]
        info = HEX_INFO[self.id]
        self.name = info["name"]
        self.full_name = info["full_name"]
        self.lower = info["lower"]          # 下卦（内卦）
        self.upper = info["upper"]          # 上卦（外卦）
        self.symbol = info["symbol"]
        self.palace, self.palace_pos, self.shi, self.ying = palace_of(self.lines)
        self.palace_element = BAGUA[self.palace]["wuxing"]
        self.palace_guaming = palace_guaming(self.lines)
        text = TEXTS[str(self.id)]
        self.guaci = text["guaci"]
        self.yaoci = {y["pos"]: y for y in text["yaoci"]}

    def summary(self):
        """轻量摘要（不含卦爻辞长文）"""
        return {
            "id": self.id, "name": self.name, "full_name": self.full_name,
            "symbol": self.symbol, "lines": list(self.lines),
            "lower": self.lower, "upper": self.upper,
            "lower_xiang": BAGUA[self.lower]["xiang"],
            "upper_xiang": BAGUA[self.upper]["xiang"],
            "wuxing": f"{BAGUA[self.upper]['xiang']}{BAGUA[self.lower]['xiang']}",
            "palace": self.palace, "palace_name": f"{self.palace}宫",
            "palace_element": self.palace_element,
            "palace_guaming": self.palace_guaming,
            "shi": self.shi, "ying": self.ying,
            "guaci": self.guaci,
            "yaoci": [self.yaoci[p] for p in sorted(self.yaoci)],
        }

    def changed(self, positions):
        """返回在指定位（0-5）变爻后的新卦"""
        lines = list(self.lines)
        for p in positions:
            lines[p] = 1 - lines[p]
        return Hexagram(lines)

    def mutual(self):
        """互卦：二三四爻为下互，三四五爻为上互"""
        l = self.lines
        return Hexagram((l[1], l[2], l[3], l[2], l[3], l[4]))

    def chonghe(self):
        """判六冲卦/六合卦：初四、二五、三上三对支全冲/全合"""
        from .constants import CHONG, LIUHE
        pairs = [(self.line_gz(i)[1], self.line_gz(i + 3)[1]) for i in range(3)]
        return (all(CHONG[a] == b for a, b in pairs),
                all(LIUHE[a] == b for a, b in pairs))

    def pure_palace(self):
        """本宫纯卦（用于查伏神）"""
        return Hexagram((BAGUA[self.palace]["lines"]) * 2)

    def line_gz(self, pos):
        """pos 爻（0-5）的纳甲干支"""
        return najia_gz(self.lower if pos < 3 else self.upper, pos % 3, pos >= 3)

    def line_qin(self, pos):
        """pos 爻（0-5）的六亲（以本卦宫五行论）"""
        gz = self.line_gz(pos)
        return liuqin(self.palace_element, ZHI_WUXING[gz[1]])

    def line_qin_by_palace(self, pos, palace_element):
        """以指定宫五行论六亲（变卦六亲仍按变卦宫五行断）"""
        gz = self.line_gz(pos)
        return liuqin(palace_element, ZHI_WUXING[gz[1]])

    def missing_qin(self):
        """本卦所缺之六亲（需查伏神）"""
        present = {self.line_qin(p) for p in range(6)}
        return [q for q in LIUQIN_NAMES if q not in present]

    def fu_shen(self):
        """伏神表：{所缺六亲: {"pos", "gz", "qin"}}，取本宫纯卦对应爻"""
        result = {}
        pure = self.pure_palace()
        for q in self.missing_qin():
            for p in range(6):
                if pure.line_qin(p) == q:
                    result[q] = {"pos": p + 1, "gz": pure.line_gz(p), "qin": q}
                    break
        return result

    def __repr__(self):
        return f"<Hexagram {self.full_name} {self.lines}>"


def zhi_label(zhi):
    return f"{zhi}{DIZHI.index(zhi) + 1}"
