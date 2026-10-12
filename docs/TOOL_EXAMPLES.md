# 工具调用示例

先检索，再使用返回的 ID。以下原版 ID 均来自随包目录。

```json
{ "query": "突击步枪", "category": "weapon", "styleFamily": "vanilla" }
```

调用 `get_reference` 查看方向组：

```json
{ "ids": ["apparel.shirtbasic_male_south"], "includeGroup": true }
```

二次元种族检索：

```json
{ "query": "头发", "category": "hair", "styleFamily": "anime", "race": "AgRace" }
```

为新设计准备生图说明：

```json
{
  "description": "设计一把短枪管的工业突击步枪，保留清晰枪托与握把，使用灰色金属和少量木色。",
  "primaryReferenceId": "weapon.assaultrifle",
  "references": [{ "id": "weapon.assaultrifle", "use": "style" }],
  "textureName": "CompactAssaultRifle",
  "width": 256,
  "height": 256
}
```

`prepare_texture_brief` 返回提示词、图片路径与目标规格。由 Codex 调用内置生图；以下处理示例的路径需要替换成实际输出路径：

```json
{
  "imagePath": "D:/Art/generated.png",
  "outputPath": "D:/MyMod/Textures/Weapons/CompactAssaultRifle.png",
  "primaryReferenceId": "weapon.assaultrifle",
  "width": 256,
  "height": 256,
  "outlineExpandPx": 0.5,
  "outlineColor": "#151515",
  "overwrite": false
}
```

此处的 0.5 仅演示如何表示半个最终像素，不是所有武器都应采用的默认值。已有合适轮廓时保持 0。

按模板约束服装：

```json
{
  "imagePath": "D:/Art/generated-shirt-south.png",
  "primaryReferenceId": "apparel.shirtbasic_male_south",
  "templateReferenceId": "apparel.shirtbasic_male_south",
  "outlineExpandPx": 0
}
```

修订已录入参考的说明：

```json
{
  "groupId": "local.ag-kagari-hair",
  "notes": "篝的前发 BodyAddon；后发独立。保留 1536 画布留白和连接位置，不裁切居中。",
  "styleNotes": ["轮廓以本组原图为准，保留金色发束与红色挑染的分区。"]
}
```

数组字段完整替换；不要遗漏原有的重要限制。更新工具仅修订元数据，新增图片或图片版本使用新的 `groupKey`。
