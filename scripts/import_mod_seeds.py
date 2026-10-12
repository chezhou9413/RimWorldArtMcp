#导入首批人工选定的二次元种族方向组；日常新增使用 MCP 录入工具。
import argparse
import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from import_references import pixels, overview


#核对选定贴图路径确实存在于当前模组定义中。
def find_evidence(root, texture):
    matches = []
    for file in sorted((root / "1.6" / "Defs").rglob("*.xml")):
        for node in ET.parse(file).getroot():
            if any((element.text or "").strip() == texture for element in node.iter()):
                matches.append((file.relative_to(root).as_posix(), node.findtext("defName")))
    if not matches:
        raise ValueError("定义中未找到资源路径：" + texture)
    return matches[0]


#保留源图，录入已核对的来源和占位说明，不裁切或重绘模板。
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phoenix-root", type=Path, required=True)
    parser.add_argument("--ag-root", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    library = root / "library"
    catalog_file = library / "catalog.json"
    if catalog_file.exists():
        raise ValueError("成长图库已存在；不能用种子导入覆盖，请使用 MCP 录入工具。")
    groups = [
        (args.phoenix_root, "PhoenixRace", "phoenix-body", "凤凰族女性身体", "body", "template", "AlienRace/Phoenix/body/Naked_Female", ["south", "north", "east"], "只有身体层；以此图的肩部、腰胯、腿部占位为模板，不附加头部。"),
        (args.phoenix_root, "PhoenixRace", "phoenix-head", "凤凰族头部", "head", "component", "AlienRace/Phoenix/head/Head", ["south", "north", "east"], "HAR 头部附加层，源图已含五官；不是 Facial Animation 空白头模板。"),
        (args.phoenix_root, "PhoenixRace", "phoenix-hair", "凤凰族辫子长发", "hair", "component", "AlienRace/Phoenix/hair/HairA", ["south", "north", "east", "west"], "HAR 头发附加层；具有独立 west，不用 east 镜像代替。"),
        (args.ag_root, "AgRace", "ag-kagari-body", "机动战姬篝身体", "body", "template", "AlienRace/Ag/body/body", ["south", "north", "east"], "篝的身体渲染层，不能与缘的 bodyyuan 模板混用。"),
        (args.ag_root, "AgRace", "ag-kagari-head", "机动战姬篝头部", "head", "component", "AlienRace/Ag/head/head", ["south", "north", "east"], "头部 BodyAddon；缺少的五官由其他层提供，不能当成完整头像。"),
        (args.ag_root, "AgRace", "ag-kagari-hair", "机动战姬篝前发", "hair", "component", "AlienRace/Ag/hair/hair", ["south", "north", "east"], "前发 BodyAddon；后发 hairback 是独立层。1536 画布的大量留白与对齐有关，禁止自动裁切居中。")
    ]
    items = []
    for mod, race, key, name, category, role, texture, directions, notes in groups:
        about = ET.parse(mod / "About/About.xml").getroot()
        definition_file, def_name = find_evidence(mod, texture)
        for direction in directions:
            original = mod / "Textures" / (texture + "_" + direction + ".png")
            destination = library / "images" / key / (direction + ".png")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, destination)
            items.append({"id": f"local.{key}.{direction}", "groupId": "local." + key,
                          "name": name, "aliases": [name, race, "凤凰族" if race == "PhoenixRace" else "机动战姬", texture.split("/")[-1]],
                          "tags": ["二次元", "种族", category, "完整方向组"],
                          "category": category, "role": role, "styleFamily": "anime", "race": race,
                          "bodyType": "Female" if category == "body" else None, "direction": direction,
                          "file": destination.relative_to(library).as_posix(), "notes": notes,
                          "styleNotes": ["优先保持本种族模板比例、原始画布及部件对齐。", "轮廓和柔和明暗参考本组，不统一改为原版小人体型。"],
                          "outlineNotes": "按本组原图的轮廓宽度和颜色处理；已有粗线时不再叠加。",
                          "source": {"kind": "mod", "label": about.findtext("name"), "author": about.findtext("author"),
                                     "packageId": about.findtext("packageId"), "defName": def_name,
                                     "texturePath": texture, "definitionFile": definition_file,
                                     "evidence": "核对本地 Mod XML 路径、PNG Alpha 和完整方向组；原图复制保留。"},
                          **pixels(destination)})
    catalog_file.write_text(json.dumps({"schemaVersion": 1, "count": len(items), "items": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    preview_items = [{**item, "file": "library/" + item["file"]} for item in items]
    print(json.dumps({"count": len(items), "previews": overview(preview_items, root, "anime")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
