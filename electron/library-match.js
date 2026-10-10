export function modelKey(value = '') {
  return value.trim().split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '').normalize('NFKC').toLowerCase();
}

export function matchPrompt(prompt, model) {
  const keys = new Set([modelKey(model.fileName), modelKey(model.name), ...(model.aliases || []).map(modelKey)].filter(Boolean));
  for (const field of ['text', 'extraTag', 'subNote']) {
    const value = prompt[field] || '';
    for (const match of value.matchAll(/<(?:lora|lyco):([^:<>]+)(?::[^<>]*)?>/gi)) {
      if (keys.has(modelKey(match[1]))) return 'LoRA tag';
    }
    // Exact note/tag tokens only: avoid matching "cat" to "catgirl".
    if (value.split(/[,;\n]/).some(token => keys.has(modelKey(token)))) return field === 'text' ? '名称' : '备注 / tag';
  }
  return null;
}
