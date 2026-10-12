import sharp from "sharp";
import { imageOptions } from "./images.js";

//转义用于图片标题的内容，文件名和用户输入都按普通文本处理。
function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}

//透明图铺在双色底上观察，底色仅存在于预览中。
async function checker(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = ((x >> 4) + (y >> 4)) % 2 ? 130 : 165;
    const offset = (y * width + x) * 3;
    raw[offset] = raw[offset + 1] = raw[offset + 2] = value;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

//参考拼图保留完整画布，标题注明用途；不把它当作最终多图排版要求。
export async function referenceSheet(entries, target) {
  const cell = 256, footer = 56, columns = Math.min(3, entries.length);
  const width = columns * cell, height = Math.ceil(entries.length / columns) * (cell + footer);
  const layers = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i], x = (i % columns) * cell, y = Math.floor(i / columns) * (cell + footer);
    const png = await sharp(entry.path, imageOptions).resize(cell, cell, { fit: "contain", background: "#00000000" }).png().toBuffer();
    layers.push({ input: png, left: x, top: y });
    const label = `<svg width="256" height="56"><rect width="256" height="56" fill="#e4e4e4"/><text x="6" y="18" font-size="12" font-family="sans-serif">${escapeXml(`${i + 1}. ${entry.label}`.slice(0, 30))}</text><text x="6" y="38" font-size="11" font-family="sans-serif">${escapeXml(entry.detail || "")}</text></svg>`;
    layers.push({ input: Buffer.from(label), left: x, top: y + cell });
  }
  await sharp(await checker(width, height)).composite(layers).png().toFile(target);
  return target;
}

//同时展示原画布和固定最大边长的缩小预览，方便观察线条是否黏连。
export async function comparisonSheet(files, target) {
  const columns = files.length, cell = 256, height = 420;
  const layers = [];
  for (let i = 0; i < files.length; i++) {
    const { path, label } = files[i];
    const large = await sharp(path, imageOptions).resize(cell, cell, { fit: "contain", background: "#00000000" }).png().toBuffer();
    layers.push({ input: large, left: i * cell, top: 28 });
    for (const [size, x, y] of [[128, 0, 290], [64, 148, 290]]) {
      const small = await sharp(path, imageOptions).resize(size, size, { fit: "contain", background: "#00000000" }).png().toBuffer();
      layers.push({ input: small, left: i * cell + x, top: y });
    }
    const title = `<svg width="256" height="26"><rect width="256" height="26" fill="#eeeeee"/><text x="6" y="18" font-size="13" font-family="sans-serif">${escapeXml(label)}</text></svg>`;
    layers.push({ input: Buffer.from(title), left: i * cell, top: 0 });
  }
  await sharp(await checker(cell * columns, height)).composite(layers).png().toFile(target);
  return target;
}
