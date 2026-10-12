import sharp from "sharp";
import { imageOptions, readImage } from "./images.js";

//按同一画布变换读取线条掩膜；白色选中、黑色不选中，透明度参与权重。
export async function lineMask(file, width, height, sourceWidth, sourceHeight) {
  const image = await readImage(file);
  if (image.info.width * sourceHeight !== image.info.height * sourceWidth) throw new Error("内线掩膜与输入图片的画布比例必须相同。");
  const { data, info } = await sharp(image.path, imageOptions).toColourspace("srgb").ensureAlpha()
    .resize(width, height, { fit: "contain", background: "#00000000" }).raw().toBuffer({ resolveWithObject: true });
  const result = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < result.length; i++) {
    const p = i * 4;
    result[i] = Math.round((0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) * data[p + 3] / 255);
  }
  return result;
}

//占位模板只使用 Alpha，不把模板的颜色和线稿覆盖到生成图。
export async function templateMask(file, width, height) {
  const image = await readImage(file);
  if (!image.metadata.hasAlpha) throw new Error("占位模板必须具有有效 Alpha 通道。");
  if (image.info.width * height !== image.info.height * width) throw new Error("占位模板与目标画布比例不同，不能拉伸模板。");
  const mask = await sharp(image.path, imageOptions).resize(width, height, { fit: "fill" })
    .ensureAlpha().extractChannel("alpha").raw().toBuffer();
  let min = 255, max = 0;
  for (const value of mask) { min = Math.min(min, value); max = Math.max(max, value); }
  if (min === 255 || max <= 8) throw new Error("占位模板必须同时包含主体与透明区域。");
  return mask;
}

//只膨胀单通道遮罩，避免修改暗色填充和材质颜色。
export async function dilateMask(mask, width, height, radius) {
  if (!radius) return mask;
  return sharp(mask, { raw: { width, height, channels: 1 } }).dilate(radius).raw().toBuffer();
}

//直接合成新增轮廓与原图，原图实心像素的颜色保持不变。
export function applyMasks(source, expanded, inner, template, color) {
  const out = Buffer.from(source);
  for (let i = 0; i < expanded.length; i++) {
    const p = i * 4;
    const originalAlpha = source[p + 3];
    const grownAlpha = Math.max(originalAlpha, expanded[i]);
    const targetAlpha = template ? Math.min(grownAlpha, template[i]) : grownAlpha;
    const selected = inner ? inner[i] / 255 : 0;
    const originalWeight = grownAlpha ? originalAlpha / grownAlpha : 0;
    for (let c = 0; c < 3; c++) {
      const rgb = source[p + c] * (1 - selected) + color[c] * selected;
      out[p + c] = targetAlpha ? Math.round(rgb * originalWeight + color[c] * (1 - originalWeight)) : 0;
    }
    out[p + 3] = targetAlpha;
  }
  return out;
}
