import { useEffect, useState } from 'react';
import './Repository.css';

export default function Updates() {
  const api = window.api?.updates;
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    if (api) api.info().then(result => { if (active) { if (result.success) setInfo(result); else setError(result.error); } }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [api]);
  async function install() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.install();
      if (!result.success) throw new Error(result.error);
      setMessage(result.started ? '更新已启动，软件即将退出…' : '已取消更新。');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="repository"><header className="repository-header"><div><div className="repository-eyebrow">LOCAL UPDATE</div><h1>软件更新</h1><p>选择已下载的新版安装包，保留现有资料更新。</p></div></header>
    <div className="update-panel"><h2>当前版本 {info?.version || '—'}</h2><p>Windows 选择 EXE，Mac 选择 DMG。只接受比当前版本更新的 Prompt Manager 安装包。</p><p className="detail-hint">Windows 会打开安装向导，请沿用原安装目录。Mac 会替换当前应用并重新打开，旧应用保留为备份。模型、HTML 存档及 tag 关联保存在原位置。</p>
      <button className="btn-primary" disabled={busy || !info?.packaged} onClick={install}>{busy ? '正在检查安装包…' : '选择安装包并更新'}</button>
      {!info?.packaged && <p className="detail-hint">此功能需要在安装后的桌面版使用。</p>}
      {info?.previous && <p className={info.previous.success ? 'repository-status' : 'repository-error'}>{info.previous.message}{info.previous.backup && <><br />旧应用备份：{info.previous.backup}</>}</p>}
      {error && <p className="repository-error" role="alert">{error}</p>}<p className="repository-status" role="status">{message}</p>
    </div>
  </section>;
}
