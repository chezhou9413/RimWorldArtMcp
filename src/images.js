import sharp from "sharp";
import { inputPath } from "./paths.js";

export const imageOptions = { limitInputPixels: 32 * 1024 * 1024 };

//读取静态图片，方向贴图不接受多帧输入。
export async function readImage(file) {
  const resolved = inputPath(file);
  const metadata = await sharp(resolved, imageOptions).metadata();
  if ((metadata.pages || 1) !== 1) throw new Error("只接受单帧图片。");
  const raw = await sharp(resolved, imageOptions).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { path: resolved, metadata, ...raw };
}

//检查真实透明像素、占位边界和触边情况，不把存在 Alpha 通道等同于背景透明。
export function analyzePixels(data, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1, transparent = 0, solid = 0, partial = 0;
  let alphaMin = 255, alphaMax = 0, edgePixels = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = data[(y * width + x) * 4 + 3];
    alphaMin = Math.min(alphaMin, a); alphaMax = Math.max(alphaMax, a);
    if (a <= 8) transparent++;
    else {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (!x || !y || x === width - 1 || y === height - 1) edgePixels++;
    }
    if (a === 255) solid++; else if (a > 0) partial++;
  }
  const bounds = x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const corners = [0, width - 1, (height - 1) * width, width * height - 1].map(i => data[i * 4 + 3]);
  const warnings = [];
  if (!bounds) warnings.push("图片没有可见主体。");
  if (alphaMin === 255) warnings.push("图片完全不透明，背景可能尚未去除。");
  else if (!transparent) warnings.push("没有充分透明的像素，背景可能只是降低了不透明度。");
  if (corners.some(a => a > 8)) warnings.push("至少一个角落存在可见内容，需看图确认是否残留背景。");
  if (edgePixels) warnings.push("可见内容触及画布边缘，需确认是否裁切或属于预期接缝。");
  return { width, height, alphaMin, alphaMax, bounds, cornerAlpha: corners, edgePixels,
    transparentFraction: transparent / (width * height), solidFraction: solid / (width * height),
    partialFraction: partial / (width * height), warnings };
}

//输出原始画布和像素检查，不进行自动裁切。
export async function inspectPixels(file) {
  const image = await readImage(file);
  return { path: image.path, format: image.metadata.format, hasAlphaChannel: Boolean(image.metadata.hasAlpha),
    ...analyzePixels(image.data, image.info.width, image.info.height) };
}

//生成 MCP 图片内容块，保留透明背景。
export async function imageContent(file, maxSide = 1024) {
  const data = await sharp(file, imageOptions).resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { type: "image", mimeType: "image/png", data: data.toString("base64") };
}
