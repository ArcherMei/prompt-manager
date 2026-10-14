import { useEffect, useRef, useState } from 'react';
import './TagLookup.css';
const labels = { exact: '精确匹配（名称 / 别名）', suggestion: '单标签建议', combination: '组合建议', 'not-found': '本地索引中未找到可靠匹配' };
export default function TagLookup({ onInsert, builderTags = '' }) {
  const dialog = useRef(null), request = useRef(0);
  const [query, setQuery] = useState('');
  const [scene, setScene] = useState(''), [existingTags, setExistingTags] = useState('');
  const [reference, setReference] = useState(null), [imageBusy, setImageBusy] = useState(false);
  const [prompts, setPrompts] = useState(null);
  async function selectImage(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setResult(null); setMessage(''); setImageBusy(true);
    let bitmap;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片');
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      setReference({ name: file.name, data: canvas.toDataURL('image/jpeg', 0.85) });
    } catch (error) { setReference(null); setMessage(error.message || '图片读取失败'); }
    finally { bitmap?.close(); setImageBusy(false); }
  }
  const [settings, setSettings] = useState(() => {
    try { return { endpoint: 'http://127.0.0.1:1234/v1', model: '', token: '', ...JSON.parse(localStorage.getItem('tag-lookup-settings') || '{}') }; }
    catch { return { endpoint: 'http://127.0.0.1:1234/v1', model: '', token: '' }; }
  });
  const [models, setModels] = useState([]), [status, setStatus] = useState(null);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { localStorage.setItem('tag-lookup-settings', JSON.stringify({ endpoint: settings.endpoint, model: settings.model, token: settings.token })); }, [settings]);
  async function run(action, args, accept) {
    const id = ++request.current;
    setBusy(true); setMessage('');
    try {
      if (!window.api?.tags) throw new Error('请通过 Electron 桌面应用使用标签查询');
      const response = await window.api.tags(action, args);
      if (id !== request.current) return;
      if (response.error) throw new Error(response.error);
      if (!response.canceled) accept(response.data);
    } catch (error) { if (id === request.current) setMessage(error.message); }
    finally { if (id === request.current) setBusy(false); }
  }
  const change = (key, value) => { setSettings(s => ({ ...s, [key]: value })); setResult(null); };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setMessage('已复制'); }
    catch { setMessage('复制失败，请重试'); }
  }
  return <>
    <button className="btn-secondary" onClick={() => { setExistingTags(builderTags); setResult(null); dialog.current.showModal(); run('status', null, setStatus); }}>查找 Danbooru Tag</button>
    <dialog ref={dialog} className="tag-lookup" aria-labelledby="tag-title">
      <div className="tag-heading"><h2 id="tag-title">Danbooru 标签查询</h2><button aria-label="关闭查询" onClick={() => dialog.current.close()}>×</button></div>
      <form onSubmit={event => { event.preventDefault(); if (busy || imageBusy) return; setResult(null); run('search', { query, settings, scene, existingTags, image: reference?.data || '' }, setResult); }}>
        <label htmlFor="tag-query">这次想补充什么？</label>
        <div className="tag-row"><input id="tag-query" autoFocus maxLength={500} placeholder="例如：只补充蹲在墙角的姿势和位置" value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setResult(null); }} /><button className="btn-primary" disabled={busy || imageBusy || !query.trim()}>查找补充标签</button></div>
        <details><summary>补充场景 / 已有 tags / 参考图（可选）</summary>
          <label>场景背景<textarea rows={3} maxLength={4000} disabled={busy} value={scene} placeholder="例如：雨夜的小巷，人物躲在墙角。只需补姿势，环境已经写好了。" onChange={e => { setScene(e.target.value); setResult(null); }} /></label>
          <label>已有 tags（保留，不重复推荐）<textarea rows={3} maxLength={12000} disabled={busy} value={existingTags} onChange={e => { setExistingTags(e.target.value); setResult(null); }} /></label>
          <button type="button" disabled={busy} onClick={() => { setExistingTags(builderTags); setResult(null); }}>读取当前 Builder</button>
          <label>参考图 / ControlNet 原图<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || imageBusy} onChange={selectImage} /></label>
          {reference && <div className="tag-reference"><img src={reference.data} alt="已选择的参考图" /><span>{reference.name}</span><button type="button" disabled={busy} onClick={() => { setReference(null); setResult(null); }}>移除图片</button></div>}
          <p className="tag-muted">图片可不提供。文字要求优先，参考图不会被整张照搬。图片仅在查询时发送给设置中的 LM Studio，不保存到设置；看图需使用视觉模型。</p>
        </details>
      </form>
      <details><summary>数据库与 LM Studio 设置</summary>
        <p>{status ? `${status.tags.toLocaleString()} 标签 · ${status.aliases.toLocaleString()} 别名` : '尚未读取数据库'}{status?.importedAt && ` · 导入于 ${new Date(status.importedAt).toLocaleDateString()}`}</p>
        <button disabled={busy} onClick={() => { setResult(null); run('import', null, setStatus); }}>导入 tags + aliases CSV / CSV.gz</button>
        <p className="tag-muted">从 Danbooru 数据导出获取两个文件；导入会替换本地索引，失败时保留旧数据。</p>
        <label>LM Studio 地址（本机或 Mac 局域网地址）<input placeholder="http://192.168.1.20:1234/v1" disabled={busy} value={settings.endpoint} onChange={e => change('endpoint', e.target.value)} /></label>
        <p className="tag-muted">在 Windows 组装提示词、Mac 运行模型：这里填 Mac 的地址。127.0.0.1 指当前这台电脑。标签库保存在运行 Prompt Manager 的电脑上。</p>
        <div className="tag-row"><label>API Token（可选，自动保存在本机）<input type="password" autoComplete="off" disabled={busy} value={settings.token} onChange={e => change('token', e.target.value)} /></label><button disabled={busy || !settings.token} onClick={() => { change('token', ''); setMessage('已清除本机保存的 Token'); }}>清除 Token</button></div>
        <div className="tag-row"><label>模型 ID<input disabled={busy} list="tag-models" value={settings.model} onChange={e => change('model', e.target.value)} /></label><button disabled={busy} onClick={() => run('models', settings, list => { setModels(list); setMessage(list.length ? '连接成功：可选 ' + list.length + ' 个模型' : '连接成功，但未发现模型；请在 LM Studio 中加载模型'); })}>测试连接 / 刷新模型</button></div>
        <datalist id="tag-models">{models.map(model => <option key={model} value={model} />)}</datalist>
        <p className="tag-muted">可选任意本地模型（含 27B / 更大模型），请在 LM Studio 关闭 thinking 或加载非推理模型。首次加载可能较慢。</p>
      </details>
      <details><summary onClick={() => { if (!prompts && !busy) run('prompts', null, setPrompts); }}>查看系统提示词</summary>{prompts && <><h3>检索词生成</h3><pre>{prompts.expansion}</pre><h3>候选选择</h3><pre>{prompts.selection}</pre><p className="tag-muted">两步均追加：仅输出 JSON，不输出思考过程。已有标签与场景不会保存到系统提示词中。</p></>}</details>
      <div role="status" aria-live="polite">{imageBusy ? '正在读取参考图…' : busy ? '正在处理，请稍候…' : message}</div>
      {result && <section aria-label="查询结果">
        <strong>{labels[result.kind]}</strong>
        {result.note && <p>模型说明（未做语义验证）：{result.note}</p>}
        <p className="tag-muted">标签名称已通过本地数据库校验；中文语义和组合关系仍需确认。“未找到”不代表 Danbooru 一定没有此概念。</p>
        {result.rejected?.length > 0 && <p>模型提出了未通过验证的标签，已丢弃整组结果。</p>}
        <div className="tag-results">{result.tags.map(tag => <div key={tag.name} className="tag-result"><div><code>{tag.name}</code>{tag.alias && <small>别名：{tag.alias}</small>}<small>分类 {tag.category} · {tag.post_count.toLocaleString()} posts · 本地库存在</small></div><button onClick={() => copy(tag.name)}>复制</button><button onClick={() => { onInsert([tag]); setMessage('已插入 Builder'); }}>插入</button></div>)}</div>
        {result.tags.length > 1 && <div className="tag-row"><button onClick={() => copy(result.tags.map(t => t.name).join(', '))}>复制组合</button><button className="btn-primary" onClick={() => { onInsert(result.tags); setMessage('已插入 Builder'); }}>插入组合</button></div>}
      </section>}
    </dialog>
  </>;
}
