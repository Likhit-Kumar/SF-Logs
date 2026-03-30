import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function ensureDir(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

export async function saveLogFile(
  outputDir: string,
  logId: string,
  content: string,
): Promise<string> {
  const resolvedDir = await ensureDir(outputDir);
  const filePath = path.join(resolvedDir, `${logId}.log`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

export async function readLogFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  return fs.readFile(resolved, "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(path.resolve(filePath));
    return true;
  } catch {
    return false;
  }
}
