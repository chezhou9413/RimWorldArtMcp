import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

//为当前用户追加独立 MCP 配置并安装配套 Skill，不启动 Codex 或 MCP 服务。
function install() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const codexDirectory = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const configFile = path.join(codexDirectory, "config.toml");
  const serverFile = path.join(root, "src", "server.js");
  for (const dependency of ["@modelcontextprotocol/sdk", "sharp", "zod"]) {
    if (!fs.existsSync(path.join(root, "node_modules", dependency, "package.json"))) throw new Error("请先在项目目录执行 npm ci。");
  }
  const skillFiles = ["SKILL.md", "agents/openai.yaml"];
  const skillTarget = path.join(codexDirectory, "skills", "rimworld-texture-art");
  for (const file of skillFiles) {
    const source = fs.readFileSync(path.join(root, "skills", "rimworld-texture-art", file));
    const destination = path.join(skillTarget, file);
    if (fs.existsSync(destination) && !source.equals(fs.readFileSync(destination))) {
      throw new Error("已安装的 Skill 内容不同，保留现有文件。请先比较并备份：" + destination);
    }
  }
  const existing = fs.existsSync(configFile) ? fs.readFileSync(configFile, "utf8") : "";
  const section = `[mcp_servers.rimworldArt]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(serverFile)}]\nenabled = true\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n`;
  const lines = existing.split(/\r?\n/);
  const start = lines.findIndex(line => /^\[mcp_servers\.rimworldArt\]\s*$/.test(line));
  let changed = false;
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
    if (lines.slice(start, end).join("\n").trim() !== section.trim()) throw new Error("rimworldArt 已有不同配置，请按 README 手动更新，安装器不会覆盖它。");
  } else {
    fs.mkdirSync(codexDirectory, { recursive: true });
    if (existing) fs.copyFileSync(configFile, configFile + ".before-rimworld-art-" + Date.now(), fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(configFile, existing.replace(/\s*$/, "") + "\n\n" + section, "utf8");
    changed = true;
  }
  for (const file of skillFiles) {
    const destination = path.join(skillTarget, file);
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, "skills", "rimworld-texture-art", file), destination, fs.constants.COPYFILE_EXCL);
    }
  }
  console.log(JSON.stringify({ configFile, changed, skillTarget, message: "配置已写入。让 Codex 重新加载 MCP 或重启应用后使用；安装器未启动服务。" }, null, 2));
}

install();
