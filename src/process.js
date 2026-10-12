import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { references, referencePath } from "./catalog.js";
import { readImage, analyzePixels, inspectPixels, imageOptions } from "./images.js";
import { createRun, outputPath, inputPath, writePng, writeJson } from "./paths.js";
import { lineMask, templateMask, applyMasks } from "./masks.js";
import { dilateAlpha } from "./alphaDilation.js";
import { comparisonSheet } from "./previews.js";

//尺寸必须成对传入，默认沿用明确的主参考或输入画布。
export function targetSize(args, fallback) {
  if (Boolean(args.width) !== Boolean(args.height)) throw new Error("width 和 height 必须一起指定。");
  const width = args.width || fallback.width, height = args.height || fallback.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 8 || Math.max(width, height) > 2048) {
    throw new Error("目标画布的宽高必须是 8–2048 的整数。");
  }
  return { width, height };
}

//处理透明图片，保留原画布定位并归档原图、遮罩、参数和对比图。
export async function processTexture(args) {
  const source = await readImage(args.imagePath);
  const before = analyzePixels(source.data, source.info.width, source.info.height);
  if (!before.bounds) throw new Error("输入图片没有可见主体。");
  if (before.alphaMin === 255) throw new Error("输入完全不透明。请先用内置生图去除背景；本工具不会把背景误当作轮廓。");
  const chosen = references(args.referenceIds || []);
  const primary = args.primaryReferenceId ? references([args.primaryReferenceId])[0] : chosen[0];
  if (primary && !chosen.some(item => item.id === primary.id)) chosen.unshift(primary);
  const { width, height } = targetSize(args, primary || source.info);
  if (args.templatePath && args.templateReferenceId) throw new Error("templatePath 与 templateReferenceId 只能使用一个。");
  const templateRef = args.templateReferenceId ? references([args.templateReferenceId])[0] : null;
  const template = templateRef ? referencePath(templateRef) : (args.templatePath ? inputPath(args.templatePath) : null);
  const line = args.lineMaskPath ? inputPath(args.lineMaskPath) : null;
  if ((args.innerExpandPx || 0) > 0 && !line) throw new Error("加粗内线必须提供 lineMaskPath，不能自动猜测暗色区域。");
  const outside = args.outlineExpandPx || 0, inside = args.innerExpandPx || 0;
  const scale = outside || line ? Math.min(4, Math.floor(4096 / Math.max(width, height))) : 1;
  const largeWidth = width * scale, largeHeight = height * scale;
  const raw = await sharp(source.path, imageOptions).toColourspace("srgb").ensureAlpha()
    .resize(largeWidth, largeHeight, { fit: "contain", background: "#00000000" }).raw().toBuffer();
  const alpha = Buffer.alloc(largeWidth * largeHeight);
  for (let i = 0; i < alpha.length; i++) alpha[i] = raw[i * 4 + 3];
  const expanded = dilateAlpha(alpha, largeWidth, largeHeight, Math.round(outside * scale));
  const templateAlpha = template ? await templateMask(template, largeWidth, largeHeight) : null;
  const selectedLines = line ? await lineMask(line, largeWidth, largeHeight, source.info.width, source.info.height) : null;
  const inner = selectedLines ? dilateAlpha(selectedLines, largeWidth, largeHeight, Math.round(inside * scale)) : null;
  const color = (args.outlineColor || "#151515").match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
  const processed = applyMasks(raw, expanded, inner, templateAlpha, color);
  let final = await sharp(processed, { raw: { width: largeWidth, height: largeHeight, channels: 4 } })
    .resize(width, height).raw().toBuffer();
  //缩小滤波后再次限制 Alpha，防止像素漏到模板透明区域。
  if (template) {
    const mask = await templateMask(template, width, height);
    for (let i = 0; i < mask.length; i++) {
      final[i * 4 + 3] = Math.min(final[i * 4 + 3], mask[i]);
      if (!final[i * 4 + 3]) final.fill(0, i * 4, i * 4 + 3);
    }
  }
  const after = analyzePixels(final, width, height);
  if (!after.bounds) throw new Error("处理后没有可见主体，请核对占位模板是否匹配。");
  const png = await sharp(final, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const protectedInputs = [source.path, ...(template ? [template] : []), ...(line ? [line] : []), ...chosen.map(referencePath)];
  const explicitTarget = args.outputPath ? outputPath(args.outputPath, protectedInputs, args.overwrite) : null;
  const run = createRun("process");
  const archiveImage = path.join(run.directory, "processed.png");
  const rawPath = path.join(run.directory, "original" + path.extname(source.path));
  fs.copyFileSync(source.path, rawPath, fs.constants.COPYFILE_EXCL);
  if (template) fs.copyFileSync(template, path.join(run.directory, "template" + path.extname(template)), fs.constants.COPYFILE_EXCL);
  if (line) fs.copyFileSync(line, path.join(run.directory, "line-mask" + path.extname(line)), fs.constants.COPYFILE_EXCL);
  writePng(archiveImage, png);
  const preview = await comparisonSheet([{ path: source.path, label: "原图" }, { path: archiveImage, label: "处理后 / 128 与 64 缩略预览" },
    ...(primary ? [{ path: referencePath(primary), label: "主参考" }] : [])], path.join(run.directory, "comparison.png"));
  const target = explicitTarget || archiveImage;
  const result = { runId: run.id, outputPath: target, archiveDirectory: run.directory, rawPath, previewPath: preview,
    primaryReferenceId: primary?.id || null, referenceIds: chosen.map(item => item.id), prompt: args.prompt || "",
    parameters: { width, height, outlineExpandPx: outside, innerExpandPx: inside, outlineColor: args.outlineColor || "#151515",
      effectiveOutlineExpandPx: Math.round(outside * scale) / scale, effectiveInnerExpandPx: Math.round(inside * scale) / scale,
      supersampling: scale, templateReferenceId: args.templateReferenceId || null, usedTemplate: Boolean(template), usedLineMask: Boolean(line) },
    before, after, warnings: after.warnings };
  writeJson(path.join(run.directory, "run.json"), result);
  if (explicitTarget) writePng(explicitTarget, png, args.overwrite);
  return result;
}

//检查现有贴图并附加同画布预览，不更改原始文件。
export async function inspectTexture(args) {
  const inspection = await inspectPixels(args.imagePath);
  const chosen = args.referenceId ? references([args.referenceId])[0] : null;
  const files = [{ path: inspection.path, label: "待检查图片 / 128 与 64 缩略预览" }];
  if (args.compareImagePath) files.push({ path: inputPath(args.compareImagePath), label: "对比图片" });
  if (chosen) files.push({ path: referencePath(chosen), label: "参考：" + chosen.name });
  const run = createRun("inspect");
  const previewPath = await comparisonSheet(files, path.join(run.directory, "comparison.png"));
  return { ...inspection, referenceId: chosen?.id || null, previewPath,
    limitation: "检查只报告尺寸、透明度、占位和触边事实；风格、背景残留和质量需要查看图片判断。" };
}
