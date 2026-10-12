import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export const libraryRoot = path.resolve(process.env.RIMWORLD_ART_LIBRARY_DIR || path.join(packageRoot, "library"));
export const outputRoot = path.resolve(process.env.RIMWORLD_ART_OUTPUT_DIR || path.join(os.homedir(), ".cache", "rimworld-art"));

//解析已有父目录的真实路径，避免符号链接绕过源文件保护。
export function realTarget(file) {
  const absolute = path.resolve(file);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  const parent = path.dirname(absolute);
  if (parent === absolute) return absolute;
  return path.join(realTarget(parent), path.basename(absolute));
}

//判断目标是否位于指定目录内。
export function inside(root, file) {
  const relative = path.relative(realTarget(root), realTarget(file));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

//目录中的图片路径必须为包内相对路径。
export function assetPath(root, relative) {
  if (path.isAbsolute(relative) || !inside(root, path.join(root, relative))) throw new Error("参考路径超出图库目录。");
  return path.resolve(root, relative);
}

//只接受明确存在的本地文件。
export function inputPath(file) {
  if (!path.isAbsolute(file)) throw new Error("请传入图片的绝对路径。");
  const resolved = fs.realpathSync(file);
  if (!fs.statSync(resolved).isFile()) throw new Error("图片路径不是文件：" + file);
  return resolved;
}

//禁止成品处理写入参考图和输入文件，覆盖只对其他输出文件生效。
export function outputPath(file, inputs = [], overwrite = false) {
  if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== ".png") throw new Error("输出必须是绝对路径的 PNG 文件。");
  if (inside(path.join(packageRoot, "references"), file) || inside(libraryRoot, file)) throw new Error("不能覆盖参考图库，请选择其他输出目录。");
  if (inputs.some(input => realTarget(input) === realTarget(file))) throw new Error("不能覆盖输入图或模板。");
  if (fs.existsSync(file) && !overwrite) throw new Error("输出已存在；更换文件名或显式设置 overwrite=true。");
  return path.resolve(file);
}

//每次准备或处理均使用独立目录，避免并发任务互相覆盖。
export function createRun(kind) {
  if (inside(path.join(packageRoot, "references"), outputRoot) || inside(libraryRoot, outputRoot)) throw new Error("输出缓存目录不能位于参考图库内。");
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}-${randomUUID().slice(0, 8)}`;
  const directory = path.join(outputRoot, id);
  fs.mkdirSync(directory, { recursive: true });
  return { id, directory };
}

//以 UTF-8 写入工具生成的记录。
export function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
}

//最后一次写入仍使用独占标志，避免检查后出现同名文件。
export function writePng(file, buffer, overwrite = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer, { flag: overwrite ? "w" : "wx" });
}
