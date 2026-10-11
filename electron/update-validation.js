import fs from 'node:fs/promises';
import path from 'node:path';

export function requireNewerVersion(version, current) {
  const parse = value => /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value) ? value.split('.').map(Number) : null;
  const next = parse(version), old = parse(current);
  if (!next || !old) throw new Error('无法识别安装包版本，请选择正式版本安装包');
  for (let i = 0; i < Math.max(next.length, old.length); i++) {
    if ((next[i] || 0) > (old[i] || 0)) return;
    if ((next[i] || 0) < (old[i] || 0)) break;
  }
  throw new Error(`请选择比当前 ${current} 更新的版本（所选版本：${version}）`);
}

export async function validatePackage(file, platform) {
  const extension = platform === 'win32' ? '.exe' : platform === 'darwin' ? '.dmg' : null;
  if (!extension) throw new Error('此平台暂不支持本地安装包更新');
  if (path.extname(file).toLowerCase() !== extension) throw new Error(`请选择 ${extension} 安装包`);
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 512) throw new Error('安装包为空或不完整');
    const bytes = Buffer.alloc(4);
    await handle.read(bytes, 0, 4, platform === 'win32' ? 0 : stat.size - 512);
    if (platform === 'win32' ? bytes.toString('ascii', 0, 2) !== 'MZ' : bytes.toString('ascii') !== 'koly') throw new Error('安装包格式不正确，请重新下载');
  } finally { await handle.close(); }
}

export function validateIdentity(product, version, current) {
  if (product !== 'Prompt Manager') throw new Error('所选文件不是 Prompt Manager 安装包');
  requireNewerVersion(version, current);
}
