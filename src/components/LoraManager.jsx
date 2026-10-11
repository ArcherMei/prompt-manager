import { useEffect, useMemo, useRef, useState } from 'react';
import { inventoryMatches, fieldLabels, modelKey } from '../../electron/library-match.js';
import './Repository.css';

const dragType = 'application/x-prompt-manager-tag';
const sideLabel = side => side === 'storage' ? 'LoRA 仓库文件夹' : 'ComfyUI 的 LoRA 模型文件夹';
const promptTitle = p => p.note || p.extraTag || p.text || '无标题记录';
function categoryPath(id, categories) {
  const names = [], seen = new Set();
  while (id && !seen.has(id)) { seen.add(id); const c = categories.find(c => c.id === id); if (!c) break; names.unshift(c.name); id = c.parentId; }
  return names.join(' / ') || '未分类';
}
function PromptDetails({ prompt, categories }) {
  return <div className="prompt-fields"><strong>{promptTitle(prompt)}</strong><small>所属分类：{categoryPath(prompt.categoryId, categories)}</small>{Object.entries(fieldLabels).map(([key, label]) => <div key={key}><small>{label}</small><div>{prompt[key] || '（未填写）'}</div></div>)}</div>;
}

export default function LoraManager({ prompts, categories }) {
  const api = window.api?.library;
  const [library, setLibrary] = useState({});
  const [inventory, setInventory] = useState({ files: [], directory: '', warnings: [] });
  const [side, setSide] = useState('storage');
  const [tab, setTab] = useState('match');
  const [busy, setBusy] = useState(Boolean(api));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedFile, setSelectedFile] = useState('');
  const [dragOver, setDragOver] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [checked, setChecked] = useState([]);
  const [copySide, setCopySide] = useState('storage');
  const [cleanup, setCleanup] = useState(null);
  const locked = useRef(Boolean(api));
  useEffect(() => {
    let active = true;
    if (api) api.scan('storage').then(result => {
      if (!active) return;
      if (!result.success) { setError(result.error); return; }
      setLibrary(result.data); setInventory(result.inventory);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) { locked.current = false; setBusy(false); } });
    return () => { active = false; };
  }, [api]);
  async function run(action, success = '') {
    if (!api || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (!result.success) throw new Error(result.error);
      if (result.canceled) return;
      if (result.inventory) setInventory(result.inventory);
      if (result.data) setLibrary(result.data);
      if (result.comparison) { setComparison(result.comparison); setChecked([]); }
      if (result.cleanup) setCleanup(result.cleanup);
      if (result.copyResults) {
        setComparison(null); setChecked([]);
        success = result.copyResults.map(r => `${r.copied ? '已复制' : '未复制'}：${r.source}\n→ ${r.target}${r.error ? `\n${r.error}` : ''}`).join('\n');
      }
      if (result.cleanupResult) { setCleanup(null); success = `已整理 ${result.cleanupResult.count} 个文件。${result.cleanupResult.warnings.join('\n')}`; }
      if (result.exported) success = `已导出 LoRA 仓库的 ${result.exported.count} 个文件：${result.exported.output}${result.exported.skipped.length ? `\n跳过符号链接：${result.exported.skipped.join('、')}` : ''}`;
      setMessage(success);
    } catch (e) { setError(e.message); }
    finally { locked.current = false; setBusy(false); }
  }
  async function chooseDirectory(kind) {
    const result = await api.setDirectory(kind);
    if (!result.success || result.canceled) return result;
    setComparison(null); setChecked([]); setCleanup(null); setSelectedFile('');
    return api.scan(side);
  }
  const files = useMemo(() => inventoryMatches(inventory.files, prompts, library.inventoryLinks || {}), [inventory, prompts, library]);
  const selected = files.find(f => f.id === selectedFile);
  const visible = files.filter(f => `${f.relativePath} ${f.name}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || (status === 'matched' ? f.matches.length > 0 : f.matches.length === 0)));
  function candidate(p) {
    const key = selected && modelKey(selected.fileName);
    return key && key.length > 2 && Object.keys(fieldLabels).some(field => (p[field] || '').normalize('NFKC').toLowerCase().includes(key));
  }
  const tags = prompts.filter(p => (!category || p.categoryId === category) && Object.keys(fieldLabels).some(key => (p[key] || '').toLowerCase().includes(tagQuery.toLowerCase())))
    .sort((a, b) => Number(candidate(b)) - Number(candidate(a)));
  function link(file, id) { if (file && prompts.some(p => p.id === id)) run(() => api.linkPrompt(file.id, id, 'link'), `已关联：${file.relativePath} ↔ ${promptTitle(prompts.find(p => p.id === id))}`); }
  const rows = comparison?.rows.filter(r => r.side === copySide) || [];
  const selectable = rows.filter(r => r.state === 'missing');
  return <section className="repository lora-manager">
    <header className="repository-header"><div><h1>LoRA 文件管理</h1><p>两个文件夹之间复制模型；模型与 Prompt 之间建立关联。这是两种独立操作。</p></div><button className="btn-primary" disabled={busy || !api} onClick={() => run(() => api.exportZip())}>导出仓库全部文件 ZIP</button></header>
    <details className="lora-directory-settings"><summary>文件夹设置：LoRA 仓库（模型 + HTML） / ComfyUI（仅模型）{!library.deploymentDirectory && " · 请先设置 ComfyUI 文件夹"}</summary><div className="repository-directories">{['storage', 'deployment'].map(kind => <div key={kind}><strong>{sideLabel(kind)}</strong><p>{library[kind === 'storage' ? 'storageDirectory' : 'deploymentDirectory'] || '尚未选择'}</p><small>{kind === 'storage' ? '存放模型和 HTML 使用说明；新增文件放在同一层。ZIP 导出这个文件夹的全部内容（含子文件夹）。' : 'ComfyUI 生成图片时读取模型的位置，通常是 ComfyUI/models/loras；包含所有子文件夹，复制时只放模型。'}</small><button disabled={busy || !api} onClick={() => run(() => chooseDirectory(kind), `已读取${sideLabel(kind)}。选择文件夹不会搬移已有文件。`)}>选择{sideLabel(kind)}</button></div>)}</div></details>
    <p className="detail-hint">选择文件夹只读取原有文件，不自动搬家。ZIP 请保存到 LoRA 仓库文件夹之外，并使用新的文件名。</p>
    <nav className="repository-actions"><button className={tab === 'match' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('match')}>模型关联 Prompt</button><button className={tab === 'compare' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('compare')}>两个文件夹核对 / 复制</button><button className={tab === 'cleanup' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('cleanup')}>旧版编号文件夹整理</button></nav>
    {!api && <p className="repository-notice">请在桌面版中管理电脑上的 LoRA 文件。</p>}
    {error && <p className="repository-error" role="alert">{error}</p>}
    <p className="repository-status" role="status">{busy ? '正在处理；大型模型核对或 ZIP 导出可能需要几分钟，请保持软件开启…' : message}</p>
    {tab === 'compare' ? <div className="folder-tool-scroll"><h2>比较模型文件，不比较 Prompt 或 HTML</h2><p className="detail-hint">递归检查两个文件夹的全部子文件夹，以文件内容确认是否相同。同名不同内容标记冲突，不自动覆盖；有相同内容但不同名称时会显示对应路径。</p><button className="btn-primary" disabled={busy || !api} onClick={() => run(() => api.compare(), '核对完成。勾选缺少的模型后，选择复制目标子文件夹。')}>核对两个文件夹</button>
      <select aria-label="复制方向" value={copySide} disabled={busy} onChange={e => { setCopySide(e.target.value); setChecked([]); }}><option value="storage">LoRA 仓库 → ComfyUI 模型文件夹</option><option value="deployment">ComfyUI 模型文件夹 → LoRA 仓库</option></select>
      {comparison && <><p className="detail-path">来源：{sideLabel(copySide)} — {comparison[copySide]}<br/>目标：{sideLabel(copySide === 'storage' ? 'deployment' : 'storage')} — {comparison[copySide === 'storage' ? 'deployment' : 'storage']}</p><div className="repository-actions"><button disabled={busy} onClick={() => setChecked(checked.length === selectable.length ? [] : selectable.map(r => r.id))}>全选 / 取消缺少的模型</button><button className="btn-primary" disabled={busy || !checked.length} onClick={() => run(() => api.copyMissing(checked, copySide))}>复制勾选的 {checked.length} 个模型…</button></div><p className="detail-hint">接下来选择目标文件夹内的一个子文件夹；勾选的模型直接放入该文件夹，不携带 HTML。已有同名文件会跳过。</p>
      {rows.map(row => <article className="lora-file-card" key={row.id}><label><input type="checkbox" disabled={busy || row.state !== 'missing'} checked={checked.includes(row.id)} onChange={e => setChecked(e.target.checked ? [...checked, row.id] : checked.filter(id => id !== row.id))} /> {row.relativePath}</label><p>{row.state === 'both' ? '✅ 两边都有相同内容' : row.state === 'conflict' ? '⚠️ 同名不同内容，未自动覆盖' : `→ ${sideLabel(copySide === 'storage' ? 'deployment' : 'storage')}缺少这个模型`}</p>{row.peers.map(peer => <p className="detail-path" key={peer}>另一边相同模型：{peer}</p>)}{row.conflicts.map(peer => <p className="detail-path" key={peer}>另一边同名不同内容：{peer}</p>)}</article>)}{!rows.length && <p>来源文件夹没有模型。</p>}</>}
    </div> : tab === 'cleanup' ? <div className="folder-tool-scroll"><h2>整理 LoRA 仓库内的旧版编号文件夹</h2><p className="detail-path">整理范围：{library.storageDirectory}</p><p className="detail-hint">仅整理软件登记的旧版编号目录。模型放回 LoRA 仓库同一层，HTML 放到对应模型旁边，网页自带资源文件夹保留。先预览来源和目标，确认后才移动；同名冲突会阻止整理。</p><button className="btn-secondary" disabled={busy || !api} onClick={() => run(() => api.cleanupPreview())}>预览整理结果</button>{cleanup && <><p>共 {cleanup.length} 个文件</p>{cleanup.map(item => <div className="lora-file-card" key={item.id}><p className="detail-path">原文件：{item.source}<br/>整理后：{item.target}</p>{item.conflict && <p className="repository-error">目标文件或网页资源存在同名冲突，请先处理。</p>}</div>)}<button className="btn-primary" disabled={busy || !cleanup.length || cleanup.some(i => i.conflict)} onClick={() => run(() => api.cleanup())}>确认按以上路径整理</button></>}</div> : <>
      <div className="repository-toolbar"><label>查看哪个文件夹的模型 <select value={side} disabled={busy} onChange={e => { const value = e.target.value; setSide(value); setSelectedFile(''); run(() => api.scan(value)); }}><option value="storage">LoRA 仓库文件夹</option><option value="deployment">ComfyUI 的 LoRA 模型文件夹</option></select></label><button disabled={busy || !api} onClick={() => run(() => api.scan(side), '已刷新模型和自动关联。')}>重新扫描</button><span>共 {files.length} 个模型 · ✅ {files.filter(f => f.matches.length).length} 已关联</span></div>
      <p className="detail-path">正在查看：{sideLabel(side)} — {inventory.directory || '请先选择上方对应的文件夹'}</p>
      {inventory.warnings.length > 0 && <p className="repository-error">{inventory.warnings.join('\n')}</p>}
      <div className="lora-management-workspace"><div className="lora-management-files"><div className="repository-toolbar"><input aria-label="搜索模型" placeholder="搜索模型名称或子文件夹" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="关联状态" value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部模型</option><option value="matched">✅ 已关联 Prompt</option><option value="unmatched">✖️ 未关联 Prompt</option></select></div><div className="lora-file-scroll">
      {visible.map(file => <article key={file.id} className={`lora-file-card ${selectedFile === file.id ? 'selected' : ''} ${dragOver === file.id ? 'drop-active' : ''}`} onDragOver={e => { if (!busy && e.dataTransfer.types.includes(dragType)) { e.preventDefault(); setDragOver(file.id); } }} onDragLeave={() => setDragOver(null)} onDrop={e => { e.preventDefault(); setDragOver(null); if (!busy) link(file, e.dataTransfer.getData(dragType)); }}>
        <button className="lora-drop-name" disabled={busy} onClick={() => setSelectedFile(file.id)}>{file.fileName}</button><p>{file.matches.length ? '✅ 已关联 Prompt' : '✖️ 未关联 Prompt'}</p><p className="detail-path">{sideLabel(side)}内：{file.relativePath}</p><p className="detail-hint">{side === 'storage' ? file.htmlPaths?.length ? `📄 已关联 HTML：${file.htmlPaths.join('、')}` : '📄 未找到已关联 HTML（同层同名网页会自动识别，其他网页可在 HTML 网页存档中关联）' : '📄 HTML 使用说明在 LoRA 仓库文件夹管理，不复制到 ComfyUI。'}</p>
        {file.duplicateName && <p className="detail-hint">此文件夹内有同名模型，请检查子文件夹路径后手动关联。</p>}
        {file.matches.map(p => <div className="matched-prompt" key={p.id}><strong>{promptTitle(p)}</strong><small>{p.reason}</small><small>分类：{categoryPath(p.categoryId, categories)}</small><button disabled={busy} onClick={() => run(() => api.linkPrompt(file.id, p.id, 'unlink'), '已取消关联，不会在下次扫描时自动恢复。')}>取消这条关联</button></div>)}
        {(library.inventoryLinks?.[file.path]?.excluded || []).map(id => { const p = prompts.find(p => p.id === id); return p && <button className="restore-match" key={id} disabled={busy} onClick={() => run(() => api.linkPrompt(file.id, id, 'auto'), '已恢复自动关联规则。')}>恢复自动关联：{promptTitle(p)}</button>; })}
        <button className="restore-match" disabled={busy} onClick={() => run(() => api.revealInventory(file.id))}>在{sideLabel(side)}中显示此模型</button>
      </article>)}{!visible.length && <p className="detail-hint">没有符合条件的模型。请检查上方文件夹路径和筛选条件。</p>}</div></div>
      <aside className="lora-tag-panel"><h2>软件内的 Prompt / Tag 记录</h2><p className="detail-hint">① 点击左侧模型 ② 点击下方“关联到所选模型”。也支持拖动。准确同名自动关联，模糊名称仅推荐。</p><p className="detail-path">所选模型：{selected?.relativePath || '尚未选择'}</p><input aria-label="搜索 Prompt 记录" placeholder="搜索 Main Note、Complex LoRA Tag、正文…" value={tagQuery} onChange={e => setTagQuery(e.target.value)} /><select aria-label="筛选记录分类" value={category} onChange={e => setCategory(e.target.value)}><option value="">全部分类</option>{categories.map(c => <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>)}</select><div className="lora-tag-scroll">{tags.map(p => <article className="lora-draggable-tag" key={p.id} draggable={!busy} onDragStart={e => { e.dataTransfer.setData(dragType, p.id); e.dataTransfer.effectAllowed = 'link'; }}><PromptDetails prompt={p} categories={categories} />{candidate(p) && !selected?.matches.some(m => m.id === p.id) && <small>候选：记录包含模型名称，请核对后关联。</small>}<button className="btn-secondary" disabled={busy || !selected || selected.matches.some(m => m.id === p.id)} onClick={() => link(selected, p.id)}>{selected?.matches.some(m => m.id === p.id) ? '已关联到所选模型' : '关联到所选模型'}</button></article>)}{!tags.length && <p>没有符合条件的记录。</p>}</div></aside></div>
    </>}
  </section>;
}
