# RimWorld Art MCP

自带精选参考图的本地 MCP：检索原版与二次元种族风格，准备 Codex 内置生图要求，处理透明 PNG 和轮廓，并持续录入新的参考。

首版种子包含 **123 张原版参考 + 19 张二次元种族参考，共 142 张**。二次元样本来自本地 PhoenixRace 与 AgRace，按身体、头部、头发分成完整方向组。2026-10-12 实际试用又录入 1 张标为 `custom/generated` 的维修 UI 图标，当前共 143 张。图像副本已在项目内，不依赖原开发目录，不调用 Packy，也不需要生图 API Key。

## 安装

需要 Node.js 22 或更新版本。克隆仓库后安装依赖，并同时配置 MCP 与配套 Skill：

```powershell
git clone https://github.com/chezhou9413/RimWorldArtMcp.git
cd RimWorldArtMcp
npm ci --no-audit --no-fund
node scripts/install-codex.mjs
```

下载 ZIP 的用户进入解压后的项目目录，执行最后两条命令即可。配套 Skill 源文件随仓库提供，位于 [`skills/rimworld-texture-art`](skills/rimworld-texture-art)，包括 `SKILL.md` 和 `agents/openai.yaml`。

安装器追加当前用户的 `mcp_servers.rimworldArt` 配置，并复制配套 Skill。已有 Codex 配置会备份在原配置旁边；不同内容的已有 MCP 或 Skill 不会被覆盖。安装器不启动服务。让 Codex 重新加载 MCP，或重启 Codex 后使用。

手动配置时，将以下路径换成实际绝对路径：

```toml
[mcp_servers.rimworldArt]
command = "node"
args = ["D:/Tools/RimWorldArtMcp/src/server.js"]
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 120
```

同时将 `skills/rimworld-texture-art` 复制到 `$CODEX_HOME/skills`，未设置 CODEX_HOME 时为用户目录的 `.codex/skills`。

## 在 Codex 中使用

- “参考原版突击步枪，设计一把新武器，生成透明贴图。”
- “找机动战姬篝的头发方向组，按同种族比例设计新的发型。”
- “把这三张方向图录入参考库，记录它们的种族和占位要求。”
- “这张图线太细，保持颜色与内部结构，只把外轮廓加粗半个最终像素。”

默认工作流：搜索 → 看参考 → 准备说明 → Codex 内置生图 → 本地处理与看图检查。MCP 无法自行调用 Codex 内置生图；客户端需具备该工具。

Pawn 类提示词包含“禁止出现手部”的硬性约束，覆盖原版、二次元种族和自定义 Pawn，包括机械手或手形夹爪；配套 Skill 同时要求看图检查此项。

| 工具 | 用途 |
| --- | --- |
| `search_references` | 中文别名、类别、风格、种族、体型和方向检索 |
| `get_reference` | 真实参考图、绝对路径、来源和方向组 |
| `prepare_texture_brief` | 按风格/结构/模板用途准备单张图片说明与参考拼图 |
| `process_texture` | 保留画布、缩放、外线增量、指定内线、Alpha 模板限制及归档 |
| `inspect_texture` | 尺寸、透明度、占位、触边和缩略对比 |
| `add_reference_group` | 复制 PNG，录入可持续检索的参考组 |
| `update_reference_group` | 修订成长图库中一组参考的别名和风格说明 |

原版搜索默认 `styleFamily=vanilla`。二次元种族使用 `anime`；首批种族键为 `PhoenixRace` 和 `AgRace`。自定义画风使用 `custom`，跨风格浏览可用 `all`。无结果时如实返回未命中，不以类别分数混入无关图。

## 参考库如何成长

`references/` 保存内置原版基准。`library/` 保存可成长目录，已放入首批二次元参考。录入图片会复制进 `library/images/`，原文件后续移动不会影响检索。每组只包含一个角色/种族、体型和部件的方向或变体。

录入示例，图片路径须换成真实路径：

```json
{
  "groupKey": "my-race-hair-a",
  "name": "我的种族发型 A",
  "aliases": ["发型 A", "长发"],
  "category": "hair",
  "styleFamily": "anime",
  "race": "MyRace",
  "role": "component",
  "images": [
    { "imagePath": "D:/Art/HairA_south.png", "direction": "south" },
    { "imagePath": "D:/Art/HairA_north.png", "direction": "north" },
    { "imagePath": "D:/Art/HairA_east.png", "direction": "east" }
  ],
  "source": { "kind": "user", "label": "用户提供的原创角色素材", "author": "作者名称" },
  "notes": "前发层；后发单独绘制，保留画布留白。",
  "styleNotes": ["使用此种族的头部比例和线条粗细。"]
}
```

工具返回 `local.my-race-hair-a.south` 等稳定 ID。新增后立即可查，无需重建索引。更新工具的数组字段是整体替换，调用前先读取并合并已有内容。原图不通过更新工具替换，新版本应使用新的组名。

录入会核对 PNG、可见内容、方向键和重名组；来源和风格说明仍需 AI 实际看图、查定义后填写。跨会话写入采用文件锁与原子目录替换，遇到并发直接报错。进程意外中断留下 `.write.lock` 时，应先确认对应进程已退出，再手动移除残留锁。

## 描边与输出约定

- 宽高成对指定，否则沿用主参考或输入画布；支持 8–2048 像素。始终按完整画布等比 contain，不自动裁切主体。
- `outlineExpandPx` 表示额外增加的最终像素，默认 0。允许小数，内部放大后处理并缩回；结果记录实际采用的增量。
- 内部线条必须有明确 `lineMaskPath`：白色选择、黑色排除，Alpha 参与权重。深色枪身、头发填充或阴影不会被自动识别成内线。
- `templatePath` 和 `templateReferenceId` 二选一，仅限制 Alpha，不粘贴模板颜色，不补绘缺失内容。模板比例必须与目标画布相同。
- 输入全不透明会明确报错。本工具不抠绿幕、不猜背景；需要先由内置生图提供真正透明的图片。
- 预览的棋盘格只用于观察透明度，成品保留 Alpha。缩略图最大边长为 128 与 64，不模拟具体游戏缩放。
- 原图、模板、内线掩膜、成品、提示词和参数归档到用户目录 `.cache/rimworld-art`；有参考时同时记录引用 ID。指定 `outputPath` 可复制成品到 Mod。
- 覆盖需显式 `overwrite=true`，仍不能覆盖输入图或图库。发生错误不会自动重试、切换生图服务或启动游戏。

## 目录与分享

`src/` 为服务代码；`references/` 为原版图片、目录和分类风格；`library/` 为成长图库；`skills/` 为配套 Skill；`docs/previews/` 为首版人工核对图。

分享时打包这些目录以及 `package.json`、`package-lock.json`、README、来源说明和安装脚本。不要包含 `node_modules`、输出缓存、锁文件或个人 Codex 配置。不同系统的依赖由接收者执行 `npm ci` 安装。

可选环境变量：

- `RIMWORLD_ART_LIBRARY_DIR`：成长图库位置，默认项目 `library/`。
- `RIMWORLD_ART_OUTPUT_DIR`：生成说明和处理记录的位置，默认用户目录 `.cache/rimworld-art`。

外部成长图库分享时，将其完整 `catalog.json` 与 `images/` 复制到分享包的 `library/`，保留相对路径结构。不要把原版和不同来源的目录直接合并覆盖。

维护图库时可使用 `scripts/import_references.py` 与 `scripts/import_mod_seeds.py`；它们需要 Python 和 Pillow、原版 Def/源码及本地源图。日常安装、搜索、录入和图片处理只需要 Node.js。

## 验证范围

已完成语法、依赖、图片文件及元数据、编码和 Skill 格式的静态核对，并查看参考目录图。2026-10-12 在用户要求下通过标准 MCP stdio 客户端实际调用全部 7 个工具：检索、取图、准备说明、处理、检查、录入及修订均成功；新录入参考可以立即检索。

本次使用 Codex 内置生图分别生成武器、零部件、建筑、动物、机械体、服装、植物、UI 和二次元头发，共 9 张首次样例；另外输出武器外轮廓增加 0.75 最终像素的对比版本。检查了透明 PNG、参考尺寸、128/64 缩略图及服装模板限制。未测试内线掩膜，未启动 RimWorld，未进行多方向角色装配。动物细节偏多、植物偏像素化、头发占位偏移等问题说明：工具能组织参考和处理像素，不能以数值检查代替美术和装配验收。

更多接口示例见 [工具调用示例](docs/TOOL_EXAMPLES.md)。图片来源见 [来源说明](NOTICE.md)。
