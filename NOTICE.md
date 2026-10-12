# 图片与代码来源

## 参考图片

原版基准中的 123 张图片来自用户本地 RimWorld Core Texture2D 导出。贴图名及用途与本地 RimWorld **1.6.4871 rev590** 的 XML/源码核对；该版本号是元数据核对版本，导出图片当时的游戏版本未知。图片记录保留文件哈希、原资源路径和定义证据。

首批二次元参考共 19 张：

| 来源 | 图片 | 来源署名（来自 About.xml） | packageId |
| --- | --- | --- | --- |
| PhoenixRace | 身体 3、头部 3、头发 4 | PhoenixRace 团队 | chezhou.Race.PhoenixRace |
| 机动战姬 AgRace | 篝身体 3、头部 3、前发 3 | 主创：Myourar，贴图：冰皮汤圆，XML 和 dll：追踪虫 | chezhou.Race.AgRace |

种族参考保留原始 PNG、相对资源路径和 XML 证据。图片作为参考收录，不声明由本项目创作，也不对这些图片授予新的授权。原版与 Mod 图片的权利仍归各自权利人；来源记录与代码许可分开保存。

后续录入的参考在 `library/catalog.json` 中保存各自来源、作者和说明。生成图片应使用 `source.kind=generated`，不标成原版。

## 服务代码

本项目服务与安装脚本使用 MIT 许可，见 LICENSE。依赖 MCP SDK、Sharp、Zod 的许可由对应依赖包提供。参考图片不包含在本项目代码的 MIT 授权中。
