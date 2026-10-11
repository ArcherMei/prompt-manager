import { useEffect, useMemo, useState } from 'react';
import { matchPrompt, inventoryMatches } from '../../electron/library-match';
import './Repository.css';

const empty = { models: [], archives: [] };
const sizeLabel = bytes => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function Repository({ view, prompts, categories, onOpenPrompt, onToggleSelection, selectedPrompts, onManage }) {
  const [library, setLibrary] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const api = window.api?.library;
  const isModels = view === 'repository';

  useEffect(() => {
    let active = true;
    if (api) api.list().then(result => {
      if (!active) return;
      if (result.success) setLibrary(result.data);
      else setError(result.error);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [api]);

  async function run(action, successMessage = '') {
    if (busy || !api) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (!result.success) throw new Error(result.error);
      if (result.data) setLibrary(result.data);
      if (!result.canceled) {
        setMessage(result.copied !== undefined ? `${result.copied ? '模型已复制' : '目标已存在相同模型，无需重复复制'}：${result.destination}` : result.added !== undefined ? `已新增 ${result.added} 个文件。${result.warnings?.length ? `有 ${result.warnings.length} 个路径无法读取。` : '重复文件已跳过。'}` : successMessage);
        if (result.warnings?.length) setError(result.warnings.join('\n'));
        return true;
      }
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
    return false;
  }

  const matchedFiles = useMemo(() => inventoryMatches(library.models.map(m => ({ ...m, relativePath: m.path.slice((library.storageDirectory || '').length + 1) })), prompts, library.inventoryLinks || {}), [library, prompts]);
  const models = useMemo(() => matchedFiles.map(model => ({
    ...model,
    archives: library.archives.filter(archive => archive.modelId === model.id),
  })), [library, matchedFiles]);
  const visible = models.filter(model => {
    const text = [model.name, model.fileName, model.path, ...model.matches.map(p => `${p.text} ${p.note || ''} ${p.extraTag || ''}`)].join(' ').toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'matched' && model.matches.length > 0) || (filter === 'unmatched' && !model.matches.length) || (filter === 'missing' && model.missing));
  });
  const selected = visible.find(model => model.id === selectedId) || visible[0];
  const visibleArchives = library.archives.filter(archive => `${archive.title} ${models.find(model => model.id === archive.modelId)?.name || ''}`.toLowerCase().includes(query.toLowerCase()));
  const unmatchedTags = prompts.filter(prompt => /<(?:lora|lyco):/i.test(`${prompt.text} ${prompt.extraTag || ''}`) && !models.some(model => matchPrompt(prompt, model)));

  function archiveCard(archive, showLink = true) {
    return <article className="archive-card" key={archive.id}>
      <span className="archive-icon" aria-hidden="true">HTML</span>
      <div className="archive-info"><strong>{archive.title}</strong><small>{new Date(archive.createdAt).toLocaleDateString()} · 已保存副本</small>
        {showLink && <label>关联 LoRA<select aria-label={`关联 ${archive.title} 的 LoRA`} value={archive.modelId || ''} disabled={busy} onChange={event => run(() => api.linkArchive(archive.id, event.target.value), '已更新关联。')}>
          <option value="">未关联</option>{models.map(model => <option key={model.id} value={model.id}>{model.name} — {model.fileName}</option>)}
        </select></label>}
      </div>
      <div className="archive-actions"><button className="btn-secondary" disabled={busy} onClick={() => run(() => api.preview(archive.id))}>查看网页</button><button disabled={busy} onClick={() => run(() => api.reveal('archive', archive.id))}>显示文件</button></div>
    </article>;
  }

  return <section className="repository">
    <header className="repository-header">
      <div><div className="repository-eyebrow">LOCAL LIBRARY</div><h1>{isModels ? 'LoRA 仓库' : 'HTML 网页存档'}</h1><p>{isModels ? '把本地模型文件与你的 prompt、tag 对照起来。' : '保存配套网页，随时查看模型说明和参考图。'}</p></div>
      <div className="repository-actions">
        <button className="btn-secondary" onClick={onManage}>打开管理 / 核对 / ZIP 导出</button>
        {isModels ? <><button className="btn-secondary" disabled={busy || !api} onClick={() => run(() => api.importModels(true))}>添加文件夹</button><button className="btn-primary" disabled={busy || !api} onClick={() => run(() => api.importModels(false))}>＋ 添加 LoRA</button></> : <button className="btn-primary" disabled={busy || !api} onClick={() => run(() => api.importArchive(null), '网页副本已保存。')}>＋ 保存 HTML</button>}
      </div>
    </header>
    {!api && <p className="repository-notice">请在桌面版中添加本地 LoRA 和 HTML 文件；浏览器预览不支持读取本地仓库。</p>}
    <div className="repository-directories">
      <div><span>① LoRA 仓库文件夹 · 模型 + HTML 使用说明</span><p title={library.storageDirectory}>{library.storageDirectory || '软件数据目录（可更改）'}</p><button disabled={busy || !api} onClick={() => run(() => api.setDirectory('storage'), '已读取所选 LoRA 仓库文件夹，未移动或复制原有文件。')}>选择目录</button></div>
      <div><span>② ComfyUI 的 LoRA 模型文件夹 · 仅模型</span><p title={library.deploymentDirectory}>{library.deploymentDirectory || '请选择 ComfyUI/models/loras（包含所有子文件夹）'}</p><button disabled={busy || !api} onClick={() => run(() => api.setDirectory('deployment'), '复制目标已设为所选 ComfyUI 的 LoRA 模型文件夹。')}>选择目录</button></div>
    </div>
    {error && <p className="repository-error" role="alert">{error}</p>}
    <p className="repository-status" role="status">{busy ? '正在处理，请稍候…' : message}</p>
    <div className="repository-toolbar">
      <input aria-label="搜索仓库" placeholder={isModels ? '搜索名称、文件路径、匹配的 tag…' : '搜索网页或关联的 LoRA…'} value={query} onChange={event => setQuery(event.target.value)} />
      {isModels && <select aria-label="匹配状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部文件 ({models.length})</option><option value="matched">已匹配 tag</option><option value="unmatched">未匹配 tag</option><option value="missing">文件已失联</option></select>}
      <button className="btn-secondary" disabled={busy || !api} onClick={() => run(() => api.list(), '已刷新文件状态。')}>刷新</button>
    </div>
    {isModels ? <>
      <div className="repository-summary"><span><b>{models.length}</b> 个本地文件</span><span><b>{models.filter(m => m.matches.length).length}</b> 个已匹配</span><span><b>{library.archives.length}</b> 份网页存档</span></div>
      <div className="repository-workspace">
        <div className="model-list">
          {!visible.length && <div className="repository-empty"><h2>{models.length ? '没有符合条件的文件' : '建立你的 LoRA 仓库'}</h2><p>{models.length ? '试试其他关键词或匹配状态。' : '先选择仓库目录，再添加模型。所选仓库内的模型直接读取；从外部添加的模型复制到仓库同一层。同名文件不会覆盖。'}</p></div>}
          {visible.map(model => <button key={model.id} className={`model-row ${selected?.id === model.id ? 'active' : ''}`} onClick={() => { setSelectedId(model.id); setEditing(false); }}>
            <div className="model-row-heading"><strong>{model.name}</strong><span className={model.missing ? 'match-badge missing' : model.matches.length ? 'match-badge matched' : 'match-badge'}>{model.missing ? '文件失联' : model.matches.length ? `${model.matches.length} 个 tag` : '未匹配'}</span></div>
            <small>{model.fileName}</small><span className="model-path" title={model.path}>{model.path}</span><small>{sizeLabel(model.size)} · {model.archives.length} 份网页</small>
          </button>)}
        </div>
        {selected && <aside className="model-detail" key={selected.id}>
          <div className="detail-heading"><span className="repository-eyebrow">FILE DETAILS</span><button disabled={busy} onClick={() => { setName(selected.name); setEditing(true); }}>修改名称</button></div>
          {editing ? <form className="rename-form" onSubmit={async event => { event.preventDefault(); if (await run(() => api.rename(selected.id, name), '显示名称已更新，原名称仍可匹配。')) setEditing(false); }}>
            <label>显示名称<input autoFocus maxLength={200} required value={name} onChange={event => setName(event.target.value)} /></label><small>仅修改仓库显示名称，原文件名和 prompt 不变。</small><div><button type="submit" className="btn-primary" disabled={busy}>保存</button><button type="button" className="btn-secondary" onClick={() => setEditing(false)}>取消</button></div>
          </form> : <h2>{selected.name}</h2>}
          <p className="detail-file">{selected.fileName}</p><p className="detail-path">{selected.path}</p>
          <button className="btn-secondary" disabled={busy || selected.missing} onClick={() => run(() => api.reveal('model', selected.id))}>在文件夹中显示</button>
          <button className="btn-primary deploy-model" disabled={busy || selected.missing || !library.deploymentDirectory} onClick={() => run(() => api.deploy(selected.id))}>复制模型到 ComfyUI 的 LoRA 文件夹</button>
          <p className="detail-hint">只复制 {selected.fileName}，HTML 留在 LoRA 仓库文件夹。目标是上方设置的 ComfyUI 模型文件夹根目录；选择目标子文件夹请使用「打开管理」。同名不同内容的文件不会被覆盖。</p>
          {selected.missing && <p className="repository-error">文件可能已移动或磁盘未连接。恢复原路径后点击刷新。</p>}
          <div className="detail-section-heading"><h3>匹配的 prompt / tag</h3><span>{selected.matches.length}</span></div>
          {!selected.matches.length && <p className="detail-hint">没有找到同名 tag。按文件名、显示名称或历史名称精确匹配，忽略大小写与模型扩展名。</p>}
          {selected.matches.map(prompt => <div className="matched-prompt" key={prompt.id}><strong>{prompt.note || prompt.extraTag || prompt.text}</strong><code>Prompt 正文：{prompt.text}</code><small>Main Note：{prompt.note || "（未填写）"}</small><small>Complex LoRA Tag：{prompt.extraTag || "（未填写）"}</small><small>{categories.find(category => category.id === prompt.categoryId)?.name || '未分类'} · {prompt.reason}</small><div><button onClick={() => onOpenPrompt(prompt)}>前往分类</button><button onClick={() => onToggleSelection(prompt)}>{selectedPrompts.some(item => item.id === prompt.id) ? '移出 Builder' : '加入 Builder'}</button></div></div>)}
          <div className="detail-section-heading"><h3>配套网页</h3><button disabled={busy} onClick={() => run(() => api.importArchive(selected.id), '网页副本已保存并关联。')}>＋ 保存 HTML</button></div>
          {selected.archives.length ? selected.archives.map(archive => archiveCard(archive, false)) : <p className="detail-hint">保存模型介绍、下载页或 HTML 格式的网页截图。</p>}
        </aside>}
      </div>
      {unmatchedTags.length > 0 && <details className="unmatched-tags"><summary>{unmatchedTags.length} 条 LoRA prompt 尚未匹配仓库文件</summary>{unmatchedTags.map(prompt => <button key={prompt.id} onClick={() => onOpenPrompt(prompt)}>{prompt.text}</button>)}</details>}
    </> : <div className="archive-list">
      <p className="detail-hint">支持单文件 HTML，以及带同名 _files / .files 资源文件夹的完整网页。新增 HTML 与对应模型放在同一层；网页自带的资源文件夹保留。已有 HTML 可直接读取，外部 HTML 会复制到 LoRA 仓库文件夹。</p>
      {!visibleArchives.length && <div className="repository-empty"><h2>{library.archives.length ? '没有找到网页' : '留住每个模型的参考页面'}</h2><p>点击「保存 HTML」选择已保存的网页，再关联对应的 LoRA。</p></div>}
      {visibleArchives.map(archive => archiveCard(archive))}
    </div>}
  </section>;
}
