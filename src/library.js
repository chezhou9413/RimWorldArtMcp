import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { libraryRoot, packageRoot, inside } from "./paths.js";
import { catalog, styles } from "./catalog.js";
import { readImage, analyzePixels } from "./images.js";

//读取成长目录，已有但损坏的目录不会被空目录覆盖。
function readLibrary() {
  const file = path.join(libraryRoot, "catalog.json");
  if (!fs.existsSync(file)) return { schemaVersion: 1, items: [] };
  const result = JSON.parse(fs.readFileSync(file, "utf8"));
  if (result.schemaVersion !== 1 || !Array.isArray(result.items)) throw new Error("成长图库目录格式无效，不能继续写入。");
  return result;
}

//跨进程独占修改目录，遇到并发录入直接说明原因，不循环重试。
function lockLibrary() {
  if (inside(path.join(packageRoot, "references"), libraryRoot)) throw new Error("成长图库不能位于内置参考目录中。");
  fs.mkdirSync(libraryRoot, { recursive: true });
  const lock = path.join(libraryRoot, ".write.lock");
  let handle;
  try { handle = fs.openSync(lock, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("另一会话正在修改图库，或上次进程中断留下了 .write.lock。请确认写入结束；残留锁须在确认进程已退出后手动移除。");
    throw error;
  }
  fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
  return () => { fs.closeSync(handle); fs.unlinkSync(lock); };
}

//先写完整临时目录再原子替换，读者不会看到写到一半的 JSON。
function commitLibrary(value) {
  value.count = value.items.length;
  const temporary = path.join(libraryRoot, `catalog-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, path.join(libraryRoot, "catalog.json"));
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

//只清理本次创建的临时目录，不处理其他用户内容。
function removeOwnedDirectory(directory) {
  if (!inside(libraryRoot, directory) || path.resolve(directory) === path.resolve(libraryRoot)) throw new Error("临时目录清理目标超出图库。");
  fs.rmSync(directory, { recursive: true, force: true });
}

//从实心像素统计少量量化颜色，作为配色样本而非自动质量评分。
function palette(data) {
  const counts = new Map();
  const stride = Math.max(1, Math.floor(data.length / 4 / 100000));
  for (let p = 0; p < data.length; p += stride * 4) {
    if (data[p + 3] < 240) continue;
    const key = "#" + [0, 1, 2].map(c => (Math.floor(data[p + c] / 32) * 32 + 16).toString(16).padStart(2, "0")).join("");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([color]) => color);
}

//录入时复制实际 PNG，并保留名称、种族、方向、来源和风格说明。
export async function addReferenceGroup(args) {
  const groupId = "local." + args.groupKey;
  const pending = [], keys = new Set();
  for (const entry of args.images) {
    const key = entry.direction || entry.variant || "single";
    if (keys.has(key)) throw new Error("同组图片方向或 variant 重复：" + key);
    keys.add(key);
    const image = await readImage(entry.imagePath);
    if (image.metadata.format !== "png") throw new Error("录入工具保留原始图片，当前只接受 PNG；请先转换格式。");
    const metrics = analyzePixels(image.data, image.info.width, image.info.height);
    if (!metrics.bounds) throw new Error("参考图没有可见内容：" + entry.imagePath);
    if (args.role === "template" && metrics.alphaMin === 255) throw new Error("占位模板需要真实透明区域。");
    const buffer = fs.readFileSync(image.path);
    pending.push({ key, buffer, item: {
      id: `${groupId}.${key}`, groupId, name: args.name, aliases: args.aliases, tags: args.tags || [],
      category: args.category, role: args.role, styleFamily: args.styleFamily, race: args.race || null,
      bodyType: args.bodyType || null, direction: entry.direction || null, variant: entry.variant || null,
      file: `images/${args.groupKey}/${key}.png`, width: image.info.width, height: image.info.height,
      hasAlpha: Boolean(image.metadata.hasAlpha), alphaBounds: [metrics.bounds.x, metrics.bounds.y,
        metrics.bounds.x + metrics.bounds.width, metrics.bounds.y + metrics.bounds.height],
      transparentFraction: metrics.transparentFraction, paletteSamples: palette(image.data),
      sha256: createHash("sha256").update(buffer).digest("hex"), source: args.source,
      notes: args.notes || "", styleNotes: args.styleNotes || [], outlineNotes: args.outlineNotes || styles[args.category].outline,
      createdAt: new Date().toISOString()
    }, warnings: metrics.warnings });
  }
  const unlock = lockLibrary();
  const stage = path.join(libraryRoot, `.import-${randomUUID()}`);
  const final = path.join(libraryRoot, "images", args.groupKey);
  let moved = false, committed = false;
  try {
    if (catalog().some(item => item.groupId === groupId) || fs.existsSync(final)) throw new Error("groupKey 已存在，请用 update_reference_group 修改说明，或使用新的组名录入新图片。");
    const value = readLibrary();
    fs.mkdirSync(stage);
    for (const entry of pending) fs.writeFileSync(path.join(stage, entry.key + ".png"), entry.buffer, { flag: "wx" });
    fs.mkdirSync(path.dirname(final), { recursive: true });
    fs.renameSync(stage, final);
    moved = true;
    value.items.push(...pending.map(entry => entry.item));
    commitLibrary(value);
    committed = true;
    return { groupId, referenceIds: pending.map(entry => entry.item.id), libraryDirectory: libraryRoot,
      copiedFiles: pending.map(entry => path.join(libraryRoot, entry.item.file)),
      warnings: pending.flatMap(entry => entry.warnings.map(message => `${entry.key}：${message}`)),
      nextStep: "录入已生效；用 get_reference 查看整组。之后可用 update_reference_group 补充别名、种族、风格与使用限制。分享时连同 library 目录一起打包。" };
  } finally {
    try {
      if (fs.existsSync(stage)) removeOwnedDirectory(stage);
      if (moved && !committed) removeOwnedDirectory(final);
    } finally { unlock(); }
  }
}

//整组更新可检索说明，不改图片、像素元数据或内置原版记录。
export function updateReferenceGroup(args) {
  const unlock = lockLibrary();
  try {
    const value = readLibrary();
    const found = value.items.filter(item => item.groupId === args.groupId);
    if (!found.length) throw new Error("该组不在成长图库中；内置原版目录不通过此工具改写。");
    const allowed = ["name", "aliases", "tags", "styleFamily", "race", "bodyType", "notes", "styleNotes", "outlineNotes", "source"];
    const updates = Object.fromEntries(allowed.filter(key => args[key] !== undefined).map(key => [key, args[key]]));
    if (!Object.keys(updates).length) throw new Error("至少提供一项需要更新的元数据。");
    for (const item of found) Object.assign(item, updates, { updatedAt: new Date().toISOString() });
    commitLibrary(value);
    return { groupId: args.groupId, updated: found.length, fields: Object.keys(updates), referenceIds: found.map(item => item.id) };
  } finally { unlock(); }
}
