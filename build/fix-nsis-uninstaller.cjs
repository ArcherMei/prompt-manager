const fs = require('node:fs/promises');
const { inflateRawSync } = require('node:zlib');
const signature = Buffer.from('efbeadde4e756c6c736f6674496e7374', 'hex');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function header(buffer) {
  for (let offset = 512; offset + 28 <= buffer.length; offset += 512) {
    if (buffer.subarray(offset + 4, offset + 20).equals(signature)) {
      const end = offset + buffer.readUInt32LE(offset + 24);
      if (end > buffer.length || end < offset + 32) throw new Error('Truncated NSIS data');
      if (buffer.readUInt32LE(offset) & 4) throw new Error('NSIS CRC checking is disabled');
      return { offset, end };
    }
  }
  throw new Error('NSIS header not found');
}

function verify(buffer) {
  const { end } = header(buffer);
  if (crc32(buffer.subarray(512, end - 4)) !== buffer.readUInt32LE(end - 4)) {
    throw new Error('NSIS CRC mismatch');
  }
}

function blocks(buffer) {
  const { offset, end } = header(buffer);
  const result = [];
  for (let pos = offset + 28; pos < end - 4;) {
    const size = buffer.readUInt32LE(pos);
    pos += 4;
    const length = size & 0x7fffffff;
    if (!length || pos + length > end - 4) throw new Error('Invalid NSIS block');
    const data = buffer.subarray(pos, pos + length);
    result.push(size >>> 31 ? inflateRawSync(data) : data);
    pos += length;
  }
  return result;
}

// Match NSIS EW_WRITEUNINSTALLER: apply the resource/icon patches preceding
// the uninstaller data. electron-builder 26.8.1's macOS reader omits these.
// Preserve the compiler's original CRC; never disable or rewrite the checksum.
function reconstruct(installer, uninstaller) {
  verify(installer);
  const { offset } = header(uninstaller);
  const data = blocks(installer);
  const index = data.findIndex(block => block.equals(uninstaller.subarray(offset)));
  if (index < 1) throw new Error('Uninstaller patch block not found');
  const patches = data[index - 1];
  const fixed = Buffer.from(uninstaller);
  let pos = 0;
  while (pos + 4 <= patches.length) {
    const size = patches.readUInt32LE(pos);
    if (!size) {
      verify(fixed);
      return fixed;
    }
    if (pos + 8 > patches.length) break;
    const target = patches.readUInt32LE(pos + 4);
    pos += 8;
    if (pos + size > patches.length || target < 512 || target + size > offset) break;
    patches.copy(fixed, target, pos, pos + size);
    pos += size;
  }
  throw new Error('Invalid uninstaller resource patches');
}

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'win32') return;
  const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil');
  if (UninstallerReader.promptManagerFixed) return;
  const original = UninstallerReader.exec;
  UninstallerReader.exec = async (installerPath, uninstallerPath) => {
    await original.call(UninstallerReader, installerPath, uninstallerPath);
    const [installer, uninstaller] = await Promise.all([fs.readFile(installerPath), fs.readFile(uninstallerPath)]);
    const fixed = reconstruct(installer, uninstaller);
    await fs.writeFile(uninstallerPath, fixed);
    console.log('  • verified NSIS uninstaller resource patches and CRC');
  };
  UninstallerReader.promptManagerFixed = true;
};
module.exports.verify = verify;
module.exports.blocks = blocks;
module.exports.reconstruct = reconstruct;
