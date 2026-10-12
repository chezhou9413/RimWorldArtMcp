import fs from "node:fs";
import path from "node:path";
import { packageRoot, libraryRoot, assetPath } from "./paths.js";

export const styles = JSON.parse(fs.readFileSync(path.join(packageRoot, "references/styles.json"), "utf8"));

//合并内置目录和持续录入目录；每次读取成长目录，使多个 Codex 会话能看到新参考。
export function catalog() {
  const builtin = JSON.parse(fs.readFileSync(path.join(packageRoot, "references/catalog.json"), "utf8"));
  const libraryFile = path.join(libraryRoot, "catalog.json");
  const local = fs.existsSync(libraryFile) ? JSON.parse(fs.readFileSync(libraryFile, "utf8")) : { items: [] };
  return [...builtin.items.map(item => ({ ...item, storage: "bundled", styleFamily: item.styleFamily || "vanilla" })),
    ...local.items.map(item => ({ ...item, storage: "library" }))];
}

//把记录中的相对路径转换为本机真实可读路径。
export function referencePath(item) {
  return assetPath(item.storage === "library" ? libraryRoot : packageRoot, item.file);
}

//按稳定 ID 查找参考，缺失时明确报错。
export function references(ids) {
  const all = catalog();
  return [...new Set(ids)].map(id => {
    const item = all.find(entry => entry.id === id);
    if (!item) throw new Error("参考 ID 不存在：" + id);
    return item;
  });
}

//统一别名中的空格和大小写，保留中文内容。
function normalize(text) {
  return String(text).normalize("NFKC").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

//英文按词界匹配，避免 male 命中 female；中文允许自然语言中包含完整别名。
function contains(text, term) {
  if (!term) return false;
  if (/^[a-z0-9 .]+$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(text);
  }
  return term.length >= 2 && text.includes(term);
}

//仅用真实名称、别名或标签命中纳入候选；类别过滤不能挽救无关查询。
export function searchReferences(args) {
  const query = normalize(args.query || "");
  const all = catalog();
  const results = [];
  for (const item of all) {
    if (args.category && item.category !== args.category) continue;
    if (args.direction && item.direction !== args.direction) continue;
    if (args.bodyType && normalize(item.bodyType || "") !== normalize(args.bodyType)) continue;
    if (args.race && normalize(item.race || "") !== normalize(args.race)) continue;
    if (args.role && item.role !== args.role) continue;
    const family = args.styleFamily || "vanilla";
    if (family !== "all" && item.styleFamily !== family) continue;
    const terms = [item.name, item.id, item.source?.defName, ...(item.aliases || []), ...(item.tags || [])].filter(Boolean);
    const reasons = [];
    let score = 0;
    for (const term of terms) {
      const value = normalize(term);
      if (query && (query === value || contains(query, value) || contains(value, query))) {
        reasons.push("名称/别名命中：" + term);
        score = Math.max(score, (query === value ? 100 : 40) + Math.min(value.length, 25));
      }
    }
    const categoryOnly = query && [item.category, ...(styles[item.category]?.aliases || [])].some(term => normalize(term) === query);
    if (categoryOnly) { score = Math.max(score, 20); reasons.push("明确查询类别"); }
    if (query && !score) continue;
    if (!query) reasons.push("按过滤条件浏览");
    results.push({ id: item.id, groupId: item.groupId, name: item.name, category: item.category,
      styleFamily: item.styleFamily, race: item.race || null, direction: item.direction,
      bodyType: item.bodyType, role: item.role, width: item.width, height: item.height,
      score, reasons, notes: item.notes });
  }
  results.sort((a, b) => b.score - a.score || a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id));
  return { totalIndexed: all.length, matched: results.length, results: results.slice(0, args.limit || 12),
    message: results.length ? "用 get_reference 查看真实图片，再确定参考用途。" : "未找到相关参考。可缩短关键词、调整风格/种族过滤，或用 add_reference_group 录入新参考。" };
}

//返回与图片一起阅读的分类风格，二次元种族以自身模板为比例基准。
export function styleFor(item) {
  const profile = styles[item.category];
  //Pawn 的无手约束同时用于原版、二次元种族和自定义参考。
  const pawnRules = ["animal", "mechanoid", "body", "apparel", "hair", "head", "addon", "facial"].includes(item.category)
    ? ["Pawn 绘制硬性约束：禁止出现手部，不画手掌、手指、拳头、握持武器的手、手套手形、机械手或手形夹爪；不得为了持械、姿势或补全角色而添加手部。此约束适用于原版、二次元种族及自定义 Pawn。"] : [];
  const extraRules = [...(item.styleNotes || []), ...pawnRules];
  if (item.styleFamily === "vanilla") return { ...profile, extraRules };
  return { label: `${item.styleFamily} / ${profile.label}`,
    rules: ["优先匹配选定种族的头身比例、五官位置、线宽和上色层次，不强制改成原版小人比例。",
      "头、身体、头发、服装、BodyAddon 和面部部件是不同层；保留原方向、画布、中心与透明占位。",
      "只采用参考中的风格和占位要求，保留用户要求的新角色、新装备或新设计。",
      "低分辨率预览仍应清晰，避免通过增加发丝、反光或噪点制造虚假细节。"],
    outline: "以同种族同部件的参考线宽为准，不自动套用原版粗黑边。", extraRules };
}
