export const fieldLabels = { note: 'Main Note', extraTag: 'Complex LoRA Tag', text: 'Prompt 正文', subNote: 'Sub-Note' };

export function modelKey(value = '') {
  return value.trim().split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '').normalize('NFKC').toLowerCase();
}

export function matchPrompt(prompt, model) {
  const keys = new Set([modelKey(model.fileName), modelKey(model.name), ...(model.aliases || []).map(modelKey)].filter(Boolean));
  for (const field of ['note', 'extraTag', 'text', 'subNote']) {
    const value = prompt[field] || '';
    for (const match of value.matchAll(/<(?:lora|lyco):([^:<>]+)(?::[^<>]*)?>/gi)) {
      if (keys.has(modelKey(match[1]))) return `${fieldLabels[field]} 中的 LoRA 名称：${match[1]}`;
    }
    // Exact note/tag tokens only: avoid matching "cat" to "catgirl".
    if (value.split(/[,;\n]/).some(token => keys.has(modelKey(token)))) return `文件名与 ${fieldLabels[field]} 一致`;
  }
  return null;
}

function relativeKey(value = '') {
  return value.trim().replace(/\\/g, '/').replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '').normalize('NFKC').toLowerCase();
}

export function inventoryMatches(files, prompts, links = {}) {
  const counts = new Map();
  for (const file of files) {
    const key = modelKey(file.fileName);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return files.map(file => {
    const link = links[file.path] || {};
    const matches = prompts.flatMap(prompt => {
      if (link.excluded?.includes(prompt.id)) return [];
      if (link.promptIds?.includes(prompt.id)) return [{ ...prompt, reason: '手动匹配' }];
      const keys = new Set([file.fileName, file.name, ...(file.aliases || [])].map(modelKey));
      let reason = ''; 
      for (const field of ['note', 'extraTag', 'text', 'subNote']) {
        const value = prompt[field] || '';
        const tokens = [...Array.from(value.matchAll(/<(?:lora|lyco):([^:<>]+)(?::[^<>]*)?>/gi), m => m[1]), ...value.split(/[,;\n]/)];
        const matched = tokens.find(token => {
          const normalized = relativeKey(token);
          // Explicit subfolder paths disambiguate identically named models.
          if (normalized.includes('/')) return normalized === relativeKey(file.relativePath) || normalized === relativeKey(file.path);
          return counts.get(modelKey(file.fileName)) === 1 && keys.has(modelKey(token));
        });
        if (matched) { reason = `${fieldLabels[field]} → ${matched.trim()}`; break; }
      }
      return reason ? [{ ...prompt, reason: `自动关联：${reason}` }] : [];
    });
    return { ...file, matches, duplicateName: counts.get(modelKey(file.fileName)) > 1 };
  });
}
