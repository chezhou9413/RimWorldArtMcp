import { z } from "zod";

export const category = z.enum(["weapon", "item", "building", "animal", "mechanoid", "body", "head", "apparel", "hair", "addon", "facial", "plant", "ui"]);
const direction = z.enum(["south", "north", "east", "west"]);
const role = z.enum(["main", "template", "component", "mask", "ui"]);
const family = z.enum(["vanilla", "anime", "custom"]);
const absolutePath = z.string().min(1).max(2000).describe("本地文件绝对路径");
const ids = z.array(z.string().min(1)).max(12);
const width = z.number().int().min(8).max(2048).optional();
const names = z.array(z.string().min(1).max(120)).max(40);
const note = z.string().max(4000);
const groupKey = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).describe("稳定的英文小写组名；每组只录入一个种族、体型和部件");
const source = z.object({
  label: z.string().min(1).max(200), kind: z.enum(["game", "mod", "user", "generated"]),
  author: z.string().max(200).optional(), packageId: z.string().max(200).optional(),
  defName: z.string().max(200).optional(), texturePath: z.string().max(500).optional(),
  definitionFile: z.string().max(500).optional(), evidence: note.optional(),
  rightsNote: note.optional()
}).describe("来源信息来自实际核对；相对资源路径可分享，不填密钥或个人绝对路径");

export const schemas = {
  search: {
    query: z.string().max(300).optional(), category: category.optional(),
    styleFamily: z.enum(["vanilla", "anime", "custom", "all"]).default("vanilla"),
    race: z.string().max(120).optional(), direction: direction.optional(), bodyType: z.string().max(80).optional(),
    role: role.optional(), limit: z.number().int().min(1).max(30).default(12)
  },
  get: { ids: ids.min(1), includeGroup: z.boolean().default(false), includeImages: z.boolean().default(true) },
  brief: {
    description: z.string().min(1).max(8000), primaryReferenceId: z.string().min(1),
    references: z.array(z.object({ id: z.string().min(1), use: z.enum(["style", "structure", "template"]) })).min(1).max(6),
    width, height: width, direction: direction.optional(),
    textureName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,99}$/).optional()
  },
  process: {
    imagePath: absolutePath, outputPath: absolutePath.optional(), width, height: width,
    primaryReferenceId: z.string().optional(), referenceIds: ids.optional(), prompt: z.string().max(20000).optional(),
    outlineExpandPx: z.number().min(0).max(8).default(0).describe("外轮廓额外增加的最终输出像素；不是总线宽"),
    outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#151515"),
    lineMaskPath: absolutePath.optional().describe("白色选择内线、黑色排除，透明度参与权重；与输入画布同比例"),
    innerExpandPx: z.number().min(0).max(8).default(0),
    templatePath: absolutePath.optional(), templateReferenceId: z.string().optional(), overwrite: z.boolean().default(false)
  },
  inspect: { imagePath: absolutePath, referenceId: z.string().optional(), compareImagePath: absolutePath.optional() },
  add: {
    groupKey, name: z.string().min(1).max(120), aliases: names.min(1), tags: names.optional(), category,
    styleFamily: family, race: z.string().max(120).optional(), bodyType: z.string().max(80).optional(), role,
    images: z.array(z.object({ imagePath: absolutePath, direction: direction.optional(),
      variant: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional() })).min(1).max(12),
    source, notes: note.optional(), styleNotes: z.array(note).max(12).optional(), outlineNotes: note.optional()
  },
  update: {
    groupId: z.string().min(1), name: z.string().min(1).max(120).optional(), aliases: names.min(1).optional(),
    tags: names.optional(), styleFamily: family.optional(), race: z.string().max(120).nullable().optional(),
    bodyType: z.string().max(80).nullable().optional(), notes: note.optional(),
    styleNotes: z.array(note).max(12).optional(), outlineNotes: note.optional(), source: source.optional()
  }
};
