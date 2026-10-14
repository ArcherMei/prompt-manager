export function lmEndpoint(value) {
  let url;
  try { url = new URL(value || 'http://127.0.0.1:1234/v1'); }
  catch { throw new Error('请输入完整的 LM Studio 地址，例如 http://192.168.1.20:1234/v1'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || ['0.0.0.0', '[::]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/v1') throw new Error('请填写运行 LM Studio 的电脑地址，结尾为 /v1；Token 请填写在单独的输入框中');
  return url.href.replace(/\/$/, '');
}
export async function lmRequest(settings, route, body, fetcher = fetch) {
  const endpoint = lmEndpoint(settings.endpoint);
  let response;
  try {
    response = await fetcher(`${endpoint}/${route}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(body ? 180000 : 15000),
      headers: { 'Content-Type': 'application/json', ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error(body ? 'LM Studio 响应超时：检查模型是否已加载，或尝试较小模型' : '连接超时：检查 Mac 地址、端口和防火墙');
    throw new Error(`无法连接 ${endpoint}：请确认服务已启动；跨电脑连接需在 LM Studio 开启 Serve on Local Network，并检查两台电脑的网络和防火墙`);
  }
  if (!response.ok) throw new Error(`LM Studio HTTP ${response.status}：检查服务、模型及认证设置；若附带参考图，请确认模型支持视觉输入`);
  return response.json();
}
export async function askJSON(settings, instruction, input, image) {
  if (typeof settings.model !== 'string' || !settings.model.trim()) throw new Error('请先选择或填写模型 ID');
  const result = await lmRequest(settings, 'chat/completions', {
    model: settings.model, temperature: 0, max_tokens: 800, stream: false,
    messages: [{ role: 'system', content: `${instruction} Return only JSON. Do not reason or output thinking. /no_think` },
      { role: 'user', content: image ? [{ type: 'text', text: JSON.stringify(input) }, { type: 'image_url', image_url: { url: image } }] : JSON.stringify(input) }]
  });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('模型未返回文本');
  try { return JSON.parse(content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); }
  catch { throw new Error('模型未返回有效 JSON；请关闭模型 thinking 或换用 instruct 模型'); }
}
