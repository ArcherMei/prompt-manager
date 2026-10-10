const fs = require('node:fs/promises');
const { verify, blocks } = require('./fix-nsis-uninstaller.cjs');

function verifyInstaller(buffer) {
  verify(buffer);
  const signature = Buffer.from('efbeadde4e756c6c736f6674496e7374', 'hex');
  const uninstallers = blocks(buffer).filter(block => {
    if (block.toString('ascii', 0, 2) !== 'MZ') return false;
    for (let offset = 512; offset + 28 <= block.length; offset += 512) {
      if (block.subarray(offset + 4, offset + 20).equals(signature)) {
        return (block.readUInt32LE(offset) & 1) !== 0;
      }
    }
    return false;
  });
  if (uninstallers.length !== 1) throw new Error('Expected exactly one embedded NSIS uninstaller');
  verify(uninstallers[0]);
  return uninstallers[0];
}

module.exports = async function artifactBuildCompleted(event) {
  if (event.target?.name !== 'nsis' || !event.file.endsWith('.exe')) return;
  verifyInstaller(await fs.readFile(event.file));
  console.log('  • final installer and embedded uninstaller CRC checks passed');
};
module.exports.verifyInstaller = verifyInstaller;
