import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const extensions = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf']);

// Index existing files in place. Never follow directory symlinks or copy models.
export async function scanModels(directory) {
  const root = await fs.realpath(directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('请选择 LoRA 文件夹');
  const files = [], warnings = [];
  async function visit(folder) {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); }
    catch (error) { warnings.push(`${folder}: ${error.message}`); return; }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      try {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) await visit(file);
        else if (stat.isFile() && extensions.has(path.extname(file).toLowerCase())) {
          files.push({ id: createHash('sha256').update(file).digest('hex'), path: file,
            fileName: entry.name, name: path.parse(entry.name).name,
            relativePath: path.relative(root, file), size: stat.size });
        }
      } catch (error) { warnings.push(`${file}: ${error.message}`); }
    }
  }
  await visit(root);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN', { numeric: true }));
  return { directory: root, files, warnings };
}
