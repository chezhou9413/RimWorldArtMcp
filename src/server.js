import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { schemas } from "./schemas.js";
import { catalog, references, referencePath, searchReferences, styleFor } from "./catalog.js";
import { prepareTextureBrief } from "./brief.js";
import { processTexture, inspectTexture } from "./process.js";
import { addReferenceGroup, updateReferenceGroup } from "./library.js";
import { imageContent } from "./images.js";
import { createRun } from "./paths.js";
import { referenceSheet } from "./previews.js";

const server = new McpServer({ name: "rimworld-art", version: "1.0.0" }, {
  instructions: "RimWorld 原版及二次元种族贴图参考。先 search_references，再 get_reference 看图。默认 styleFamily=vanilla；二次元种族用 anime 并限定 race。prepare_texture_brief 提供内置生图所需的参考和说明，服务不调用生图 API。add_reference_group 可持续录入参考；录入前需实际查看图片并核实用途。"
});

//保持结构化结果与图片分离，错误明确返回给调用者。
function register(name, description, inputSchema, handler, readOnly = false) {
  server.registerTool(name, { description, inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: ["process_texture", "update_reference_group"].includes(name), openWorldHint: false } }, async args => {
    try {
      const data = await handler(args);
      const content = [{ type: "text", text: JSON.stringify(data, null, 2) }];
      if (data.previewPath) content.push(await imageContent(data.previewPath));
      return { content, structuredContent: data };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  });
}

register("search_references", "搜索精选参考；支持中文、类别、种族、体型和方向。默认仅原版，二次元种族请传 styleFamily=anime。未命中不混入无关图片。", schemas.search, searchReferences, true);

register("get_reference", "读取参考的实际图片、绝对路径、来源与风格。includeGroup=true 展示完整方向组；遮罩和独立部件都有角色标记。", schemas.get, async args => {
  let chosen = references(args.ids);
  if (args.includeGroup) {
    const groups = new Set(chosen.map(item => item.groupId));
    chosen = catalog().filter(item => groups.has(item.groupId));
  }
  if (chosen.length > 12) throw new Error("一次最多展示 12 张图片，请减少参考组数量。");
  const result = { references: chosen.map(item => ({ ...item, absolutePath: referencePath(item), profile: styleFor(item) })) };
  if (args.includeImages) {
    const run = createRun("reference");
    result.previewPath = await referenceSheet(chosen.map(item => ({ path: referencePath(item), label: item.name,
      detail: `${item.direction || "single"} / ${item.role} / ${item.width}×${item.height}` })), path.join(run.directory, "references.png"));
    result.previewNote = "拼图保持原画布比例，格子统一缩放；需要检查细节时查看返回的 absolutePath 原图。";
  }
  return result;
}, true);

register("prepare_texture_brief", "按选定参考准备单张贴图说明与参考拼图。指定 style/structure/template 用途，返回供 Codex 内置 image_gen 使用的路径和提示词。", schemas.brief, prepareTextureBrief);
register("process_texture", "本地处理透明 PNG：保持画布、缩放、外轮廓增量、明确内线掩膜及模板限制。默认不加粗、不覆盖；归档原图和参数并返回对比图。", schemas.process, processTexture);
register("inspect_texture", "检查尺寸、Alpha、占位与触边，并展示原尺寸比例及 128/64 缩略图。不能替代视觉质量判断。", schemas.inspect, inspectTexture, true);
register("add_reference_group", "让图库持续成长：复制已查看的 PNG 参考，按种族/部件/体型录入一组方向图，保存来源、别名和风格说明。不调用生图或覆盖已有组。", schemas.add, addReferenceGroup);
register("update_reference_group", "整组补充或修订成长图库的名称、别名、风格、种族和使用说明；保留图片与像素元数据，不修改内置原版目录。", schemas.update, updateReferenceGroup);

await server.connect(new StdioServerTransport());
