#从人工清单导入参考图并记录原版 XML、源码和像素元数据；仅维护图库时运行。
import argparse
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from PIL import Image, ImageDraw


#加载 Core 定义及命名父节点，不执行游戏补丁或运行游戏。
def load_defs(data):
    named, defs = {}, {}
    for file in sorted((data / "Core" / "Defs").rglob("*.xml")):
        for node in ET.parse(file).getroot():
            entry = (node, file.relative_to(data).as_posix())
            if node.get("Name"):
                named[node.get("Name")] = entry
            if node.findtext("defName"):
                defs[(node.tag, node.findtext("defName"))] = entry
    return named, defs


#沿命名继承链查找标量字段，并保留实际定义位置。
def field(entry, query, named):
    visited = set()
    while entry:
        node, file = entry
        found = node.find(query)
        if found is not None:
            return found, file
        parent = node.get("ParentName")
        if not parent:
            break
        if parent in visited:
            raise ValueError("XML 继承循环：" + parent)
        visited.add(parent)
        entry = named[parent]
    return None, None


#从已核实的定义字段或源码常量关联贴图，缺少证据时直接停止导入。
def evidence(group, named, defs, code):
    if "codePath" in group:
        literal = '"' + group["codePath"] + '"'
        for file, lines in code:
            for number, line in enumerate(lines, 1):
                if literal in line:
                    return {"module": "Core", "defType": None, "defName": None,
                            "definitionFile": file, "line": number,
                            "texturePath": group["codePath"], "graphicClass": None,
                            "drawSize": None, "usage": "源码中的 UI 资源常量"}
        raise ValueError("找不到 UI 路径证据：" + group["codePath"])
    typ = group.get("type", "ThingDef")
    if "def" in group:
        entry = defs[(typ, group["def"])]
    else:
        matches = [(key, val) for key, val in defs.items() if key[0] == typ
                   and val[0].findtext("graphicData/texPath") == group["path"]]
        if len(matches) != 1:
            raise ValueError("贴图所属 Def 不唯一：" + group["path"])
        (_, group["def"]), entry = matches[0]
    query = group.get("field", "graphicData/texPath")
    if "pathSuffix" in group:
        candidates = [(parent, p) for parent in entry[0].iter()
                      for p in parent.findall("texPath")
                      if p.text.endswith(group["pathSuffix"])]
        if not candidates:
            raise ValueError("没有匹配的生物方向路径：" + group["name"])
        parent, node = candidates[-1]
        file = entry[1]
        graphic = parent.findtext("graphicClass")
        size = parent.findtext("drawSize")
        usage = "最后一个匹配的生长阶段/变体；drawSize 属于该阶段"
    else:
        node, file = field(entry, query, named)
        if node is None:
            raise ValueError("缺少贴图字段：" + group["name"])
        graphic_node, _ = field(entry, "graphicData/graphicClass", named)
        size_node, _ = field(entry, "graphicData/drawSize", named)
        graphic = graphic_node.text if graphic_node is not None else None
        size = size_node.text if size_node is not None else None
        usage = query
        if query != "graphicData/texPath":
            graphic, size = None, None
            usage += "；主物品 graphicData 不适用于此穿戴/身体/头发层"
    return {"module": "Core", "defType": typ, "defName": group["def"],
            "definitionFile": entry[1], "textureFieldFile": file,
            "texturePath": node.text, "graphicClass": graphic,
            "drawSize": size, "usage": usage}


#检查导出名和定义路径的关系，允许方向、体型、堆叠及植物变体后缀。
def check_name(stem, source, group):
    base = source["texturePath"].split("/")[-1]
    if group.get("bodyType") and group["category"] == "apparel":
        base += "_" + group["bodyType"]
    if not stem.casefold().startswith(base.casefold()):
        raise ValueError(f"导出文件与资源路径不匹配：{stem} / {base}")


#记录透明区域、颜色样本和文件校验值，颜色样本只取实心像素。
def pixels(file):
    with Image.open(file) as source:
        im = source.convert("RGBA")
        alpha = im.getchannel("A")
        box = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
        histogram = alpha.histogram()
        colors = Counter(tuple((c // 32) * 32 + 16 for c in px[:3])
                         for px in im.getdata() if px[3] >= 240)
        palette = ["#" + "".join(f"{min(c,255):02x}" for c in rgb)
                   for rgb, _ in colors.most_common(5)]
        return {"width": im.width, "height": im.height, "hasAlpha": "A" in source.getbands(),
                "alphaBounds": list(box) if box else None,
                "transparentFraction": round(sum(histogram[:9]) / (im.width * im.height), 4),
                "paletteSamples": palette, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}


#创建带稳定 ID 的目录图，供人工核对选图用途和方向。
def overview(items, root, prefix="catalog"):
    folder = root / "docs" / "previews"
    folder.mkdir(parents=True, exist_ok=True)
    pages = []
    for start in range(0, len(items), 24):
        subset = items[start:start + 24]
        sheet = Image.new("RGB", (960, ((len(subset) + 5) // 6) * 184), "#999999")
        draw = ImageDraw.Draw(sheet)
        for i, item in enumerate(subset):
            im = Image.open(root / item["file"]).convert("RGBA")
            im.thumbnail((144, 144), Image.Resampling.NEAREST)
            x, y = (i % 6) * 160, (i // 6) * 184
            sheet.paste(im, (x + (160 - im.width) // 2, y + (150 - im.height) // 2), im)
            draw.text((x + 3, y + 151), item["id"][:25], fill="black")
            draw.text((x + 3, y + 166), f'{item["width"]}x{item["height"]} {item["role"]}', fill="black")
        file = folder / f"{prefix}-{start // 24 + 1}.png"
        sheet.save(file)
        pages.append(str(file))
    return pages


#生成可搬迁的图库；个人输入路径只用于读取，不写入分发目录。
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--textures", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--source-code", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    groups = json.loads((root / "scripts/curation.json").read_text(encoding="utf-8"))
    styles = json.loads((root / "references/styles.json").read_text(encoding="utf-8"))
    named, defs = load_defs(args.data)
    code = [(p.relative_to(args.source_code).as_posix(), p.read_text(encoding="utf-8-sig").splitlines())
            for p in sorted(args.source_code.rglob("*.cs"))]
    version = (args.data.parent / "Version.txt").read_text(encoding="utf-8-sig").strip()
    items = []
    for group in groups:
        source = evidence(group, named, defs, code)
        group_id = group["category"] + "." + group["files"][0].rsplit("_", 1)[0].lower()
        if not re.search(r"_(north|south|east|west)$", group["files"][0]):
            group_id = group["category"] + "." + group["files"][0].lower()
        for stem in group["files"]:
            check_name(stem, source, group)
            original = args.textures / (stem + ".png")
            target = root / "references/images" / group["category"] / original.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, target)
            direction = re.search(r"_(north|south|east|west)$", stem)
            role = group.get("role", "ui" if group["category"] == "ui" else "main")
            items.append({"id": group["category"] + "." + stem.lower(), "groupId": group_id,
                          "name": group["name"], "aliases": group["aliases"],
                          "category": group["category"], "role": role,
                          "direction": direction[1] if direction else None,
                          "bodyType": group.get("bodyType"), "file": target.relative_to(root).as_posix(),
                          "source": {**source, "metadataVersion": version,
                                     "imageProvenance": "用户本地原版 Texture2D 导出；导出时游戏版本未知；已按定义和外观核对。"},
                          "notes": group.get("note", ""), "outlineNotes": styles[group["category"]]["outline"],
                          **pixels(target)})
    catalog = {"schemaVersion": 1, "version": "1.0.0", "count": len(items), "items": items}
    (root / "references/catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(items), "previews": overview(items, root)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
