# -*- coding: utf-8 -*-
"""处理 open-iching 原始数据 -> backend/data/hexagram_texts.json

- 与 constants.KINGWEN 卦名/上下卦表交叉验证
- 修正已知错字
- 输出：{卦序: {"name", "guaci", "yaoci": [{"pos","label","text"}]}}
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))

from core.constants import BAGUA, HEX_INFO, KINGWEN  # noqa: E402

# 已核对的勘误表（原始爬取数据中的错字）
FIXES = {
    ("乾", "九二"): ("见龙再田", "见龙在田"),
}

POS_LABELS = {1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上"}


def main():
    with open(os.path.join(HERE, "iching.json"), encoding="utf-8") as f:
        raw = json.load(f)

    assert len(raw) == 64, f"应为64卦，实得 {len(raw)}"

    out = {}
    errors = []
    for h in raw:
        i = h["id"]
        name, lower, upper = KINGWEN[i - 1]

        # 交叉验证上下卦
        comb_lower, comb_upper = h["combination"]
        if (comb_lower, comb_upper) != (lower, upper):
            errors.append(f"{i} {name}: 数据组合 {comb_lower}/{comb_upper} "
                          f"!= 卦表 {lower}/{upper}")

        # 卦名核对（坎卦数据称"习坎"，为传统别名，接受）
        if h["name"].replace("习", "") != name:
            errors.append(f"{i}: 卦名不符 数据={h['name']} 表={name}")

        yaoci = []
        for line in h["lines"]:
            label = line["name"]
            text = line["scripture"]
            fixed = FIXES.get((name, label))
            if fixed:
                if fixed[0] in text:
                    text = text.replace(fixed[0], fixed[1])
                else:
                    errors.append(f"{i} {name}{label}: 期望勘误原文未找到")
            # pos: 1-6 正爻，7 为用九/用六
            pos = line["id"] if line["id"] <= 6 else 7
            yaoci.append({"pos": pos, "label": label, "text": text})

        # 校验爻位阴阳与名称一致（如初九必须是阳爻）
        lines = HEX_INFO[i]["lines"]
        for y in yaoci:
            if y["pos"] <= 6:
                is_yang = "九" in y["label"]
                if lines[y["pos"] - 1] != (1 if is_yang else 0):
                    errors.append(f"{i} {name} {y['label']}: 爻名与阴阳不符")
            else:
                if y["label"] not in ("用九", "用六"):
                    errors.append(f"{i} {name}: 未知附辞 {y['label']}")

        out[str(i)] = {
            "name": name,
            "guaci": h["scripture"],
            "yaoci": yaoci,
        }

    if errors:
        print("验证失败：")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    dest = os.path.join(HERE, "..", "backend", "data", "hexagram_texts.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"OK: 64 卦卦爻辞已写入 {os.path.relpath(dest, HERE)}")
    print(f"卦辞 64 条，爻辞 {sum(len(v['yaoci']) for v in out.values())} 条")


if __name__ == "__main__":
    main()
