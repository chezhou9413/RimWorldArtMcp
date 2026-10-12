import path from "node:path";
import { catalog, references, referencePath, styleFor } from "./catalog.js";
import { createRun, writeJson } from "./paths.js";
import { referenceSheet } from "./previews.js";
import { targetSize } from "./process.js";

//按用途准备参考包，风格参考不自动变成需要逐像素保留的模板。
export async function prepareTextureBrief(args) {
  const chosen = references(args.references.map(item => item.id));
  const primary = chosen.find(item => item.id === args.primaryReferenceId);
  if (!primary) throw new Error("primaryReferenceId 必须在 references 列表中。");
  if (primary.role === "mask") throw new Error("遮罩不能作为主外观参考。");
  if (args.direction && primary.direction && args.direction !== primary.direction) throw new Error("主参考方向不匹配，请选择对应方向的图片。");
  const uses = new Map(args.references.map(item => [item.id, item.use]));
  const templates = chosen.filter(item => uses.get(item.id) === "template");
  if (templates.length > 1) throw new Error("一次准备一张贴图，仅指定一个占位模板；其他方向可作为结构参考。");
  if (templates.length && primary.race && templates[0].race && templates[0].race !== primary.race) throw new Error("占位模板与主参考属于不同种族。");
  if (templates.length && primary.bodyType && templates[0].bodyType && templates[0].bodyType !== primary.bodyType) throw new Error("占位模板与主参考的体型不同。");
  if (templates.length && templates[0].direction && (args.direction || primary.direction) !== templates[0].direction) throw new Error("占位模板方向不匹配。");
  const size = targetSize(args, primary);
  if (templates.length && templates[0].width * size.height !== templates[0].height * size.width) throw new Error("模板与目标画布比例不一致。");
  const profile = styleFor(primary);
  const direction = args.direction || primary.direction;
  const group = catalog().filter(item => item.groupId === primary.groupId);
  const labels = { style: "风格参考", structure: "结构参考", template: "占位模板" };
  const prompt = [
    `用途：RimWorld 单张 ${primary.category} 游戏贴图。设计要求：${args.description}`,
    `目标画布：${size.width}×${size.height}，${direction || "沿用主参考"}方向；最终尺寸由本地处理保证。`,
    ...chosen.map((item, i) => `参考 ${i + 1}（${labels[uses.get(item.id)]}）：${item.name}，${item.direction || "无方向后缀"}，${item.role}；${item.notes || "保留该用途所需特征。"}`),
    ...profile.rules, ...profile.extraRules, `线条要求：${profile.outline}`,
    templates.length ? "严格保持占位模板画布、中心和透明空隙；不要裁切居中或改变部件对齐。" : "保持参考的主体占画布比例；风格参考不要求复制原物体。",
    "真正透明背景，保留完整主体；不绘制棋盘格、绿幕、参考拼图边框、标题、文字、水印或场景背景。",
    "只生成此次要求的一张贴图；参考拼图中的多张图不表示需要生成拼图。"
  ].join("\n");
  const run = createRun("brief");
  const sheet = await referenceSheet(chosen.map(item => ({ path: referencePath(item),
    label: `${labels[uses.get(item.id)]}：${item.name}`, detail: `${item.direction || "single"} / ${item.role} / ${item.width}×${item.height}` })), path.join(run.directory, "references.png"));
  const textureName = args.textureName || "NewTexture";
  const result = { runId: run.id, prompt, styleFamily: primary.styleFamily, race: primary.race || null,
    primaryReferenceId: primary.id, profile, target: { ...size, direction: direction || null },
    references: chosen.map(item => ({ id: item.id, use: uses.get(item.id), path: referencePath(item), source: item.source })),
    referenceSheetPath: sheet, suggestedFilename: textureName + (direction ? "_" + direction : "") + ".png",
    bodyType: primary.bodyType, templateReferenceId: templates[0]?.id || null,
    directionGroup: group.map(item => ({ id: item.id, direction: item.direction, width: item.width, height: item.height })),
    nextStep: "由 Codex 查看参考后调用内置 image_gen，使用真实参考路径及 transparent_background=true；MCP 不调用生图。生成后保留原生 Alpha 并按目标尺寸处理。",
    notes: ["建筑方向图的画布宽高可能交换；身体/服装按自身模板对齐，不对各方向分别裁切居中。", "默认额外描边为 0，看图确认线条过细后才指定最终像素增量。"] };
  writeJson(path.join(run.directory, "brief.json"), result);
  return result;
}
