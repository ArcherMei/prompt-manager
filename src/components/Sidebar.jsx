import { useState, useRef } from 'react';

export default function Sidebar({ view, onChangeView, categories, activeCategory, selectedPrompts, onSelectCategory, onCreateCategory, onCreateSubCategory, onRenameCategory, onReorderCategory, onDeleteCategory, onExport, onImport, wallpaperUrl, wallpaperBlur, onSetWallpaper, onSetWallpaperBlur }) {
  const [newCat, setNewCat] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editName, setEditName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [addingSubParentId, setAddingSubParentId] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [openFolders, setOpenFolders] = useState([]);
  const [isPinned, setIsPinned] = useState(false);
  
  const [draggedId, setDraggedId] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleWallpaperChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Wallpaper must be under 5MB!");
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (onSetWallpaper) onSetWallpaper(evt.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (newCat.trim()) {
      onCreateCategory(newCat);
      setNewCat('');
    }
  };

  const handleDragStart = (e, id) => {
    e.stopPropagation();
    setDraggedId(id);
  };

  const handleDrop = (e, targetId) => {
    e.stopPropagation();
    if (draggedId && draggedId !== targetId) {
      onReorderCategory(draggedId, targetId);
    }
    setDraggedId(null);
  };

  const handleAddSub = (e, parentId) => {
    e.preventDefault();
    if (newSubName.trim()) {
      onCreateSubCategory(parentId, newSubName);
      setNewSubName('');
      setAddingSubParentId(null);
      if (!openFolders.includes(parentId)) setOpenFolders([...openFolders, parentId]);
    }
  };

  const toggleFolder = (catId, e) => {
    e.stopPropagation();
    setOpenFolders(prev => prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]);
  };

  const startEdit = (cat, e) => {
    e.stopPropagation();
    setEditingCatId(cat.id);
    setEditName(cat.name);
  };

  const handleSaveEdit = (catId) => {
    if (editName.trim()) {
      onRenameCategory(catId, editName);
    }
    setEditingCatId(null);
  };

  const handleDelete = (catId, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to completely delete this folder AND all of its sub-categories/prompts? This cannot be undone.")) {
      onDeleteCategory(catId);
    }
  };

  const startSubCreate = (cat, e) => {
    e.stopPropagation();
    setAddingSubParentId(cat.id);
    setNewSubName('');
  };

  const togglePin = () => {
    const nextState = !isPinned;
    setIsPinned(nextState);
    if (window.api && window.api.setAlwaysOnTop) {
      window.api.setAlwaysOnTop(nextState);
    }
  };

  // Deep Structural Tree Filter
  const filteredCategories = categories.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    
    // 1. Direct hit
    if (c.name.toLowerCase().includes(q)) return true;
    
    // 2. If it is a Root, check if any of its children got hit
    if (!c.parentId) {
      const childHit = categories.some(child => child.parentId === c.id && child.name.toLowerCase().includes(q));
      if (childHit) return true;
    }
    
    // 3. If it is a Child, check if its parent got hit (allows parents to auto-display all children)
    if (c.parentId) {
      const parentHit = categories.find(p => p.id === c.parentId && p.name.toLowerCase().includes(q));
      if (parentHit) return true;
    }

    return false;
  });

  const roots = filteredCategories.filter(c => !c.parentId);
  const getSubs = (parentId) => filteredCategories.filter(c => c.parentId === parentId);

  return (
    <div style={{ width: '280px', background: 'var(--bg-sidebar)', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      <nav className="library-navigation" aria-label="功能入口">
        <button aria-current={view === 'prompts' ? 'page' : undefined} onClick={() => onChangeView('prompts')}>⌘　Prompt / Tag</button>
        <button aria-current={view === 'repository' ? 'page' : undefined} onClick={() => onChangeView('repository')}>▦　LoRA 仓库</button>
        <button aria-current={view === 'archives' ? 'page' : undefined} onClick={() => onChangeView('archives')}>▤　HTML 网页存档</button>
        <button aria-current={view === 'lora-manager' ? 'page' : undefined} onClick={() => onChangeView('lora-manager')}>✓　LoRA 文件管理</button>
        <button aria-current={view === 'updates' ? 'page' : undefined} onClick={() => onChangeView('updates')}>↑　软件更新</button>
      </nav>
      <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--glass-border)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '0.5px', color: 'var(--text-primary)', marginBottom: '16px' }}>Library</h2>
        <input 
          type="text" 
          placeholder="🔍 Search trees..." 
          value={searchQuery}
          onChange={(e) => {
             setSearchQuery(e.target.value);
             if (e.target.value) setOpenFolders(categories.map(c => c.id));
             else setOpenFolders([]);
          }}
          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)' }}
        />
      </div>
      
      <div style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        {roots.length === 0 && searchQuery && (
           <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', marginTop: '12px' }}>No matches found.</p>
        )}

        {roots.map(cat => {
          const subs = getSubs(cat.id);
          const isOpen = openFolders.includes(cat.id);
          const isBeingDragged = draggedId === cat.id;

          // Check if root or any of its children have selected active prompts
          const hasSelectedPrompts = selectedPrompts && selectedPrompts.some(p => p.categoryId === cat.id || categories.find(c => c.id === p.categoryId)?.parentId === cat.id);

          return (
            <div 
               key={cat.id} 
               draggable 
               onDragStart={(e) => handleDragStart(e, cat.id)}
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => handleDrop(e, cat.id)}
               style={{ 
                  display: 'flex', flexDirection: 'column', marginBottom: '4px',
                  opacity: isBeingDragged ? 0.3 : 1, transition: 'opacity 0.2s'
               }}
            >
               <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  {editingCatId === cat.id ? (
                    <input 
                      autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleSaveEdit(cat.id)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit(cat.id)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--accent-color)' }}
                    />
                  ) : (
                    <>
                      <button
                        onClick={(e) => { onSelectCategory(cat.id); toggleFolder(cat.id, e); }}
                        style={{
                          flex: 1, textAlign: 'left', padding: '10px 14px', borderRadius: '8px',
                          backgroundColor: activeCategory === cat.id ? 'var(--chip-active)' : 'transparent',
                          color: activeCategory === cat.id ? '#ffffff' : 'var(--text-primary)',
                          border: `1px solid ${activeCategory === cat.id ? 'var(--chip-active-border)' : 'transparent'}`,
                          transition: 'all 0.2s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '80px',
                          display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', cursor: 'grab'
                        }}
                      >
                        <span style={{ fontSize: '10px', opacity: 0.5, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {cat.name}
                          {hasSelectedPrompts && <span style={{ color: 'var(--accent-color)', fontSize: '18px', lineHeight: '10px' }} title="Contains active prompts">•</span>}
                        </span>
                      </button>

                      <div style={{ position: 'absolute', right: '4px', display: 'flex', gap: '2px' }}>
                        <button onClick={(e) => startSubCreate(cat, e)} style={{ padding: '4px', color: 'rgba(255,255,255,0.3)' }} onMouseEnter={e => e.target.style.color = 'var(--accent-color)'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'} title="Add Sub-Category">+</button>
                        <button onClick={(e) => startEdit(cat, e)} style={{ padding: '4px', color: 'rgba(255,255,255,0.3)' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'}>✎</button>
                        <button onClick={(e) => handleDelete(cat.id, e)} style={{ padding: '4px', color: 'rgba(239, 68, 68, 0.3)' }} onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = 'rgba(239, 68, 68, 0.3)'}>×</button>
                      </div>
                    </>
                  )}
               </div>

               {isOpen && (
                 <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                   {addingSubParentId === cat.id && (
                      <form onSubmit={(e) => handleAddSub(e, cat.id)} style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
                         <input autoFocus type="text" placeholder="Sub-category..." value={newSubName} onChange={e => setNewSubName(e.target.value)} onBlur={() => setAddingSubParentId(null)} style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }} />
                      </form>
                   )}
                   {subs.map(sub => {
                     const isSubBeingDragged = draggedId === sub.id;
                     const subHasSelectedPrompts = selectedPrompts && selectedPrompts.some(p => p.categoryId === sub.id);

                     return (
                      <div 
                        key={sub.id} 
                        draggable 
                        onDragStart={(e) => handleDragStart(e, sub.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, sub.id)}
                        style={{ 
                          display: 'flex', alignItems: 'center', position: 'relative',
                          opacity: isSubBeingDragged ? 0.3 : 1, transition: 'opacity 0.2s'
                        }}
                      >
                        {editingCatId === sub.id ? (
                           <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => handleSaveEdit(sub.id)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit(sub.id)} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--accent-color)' }} />
                        ) : (
                           <>
                             <button
                               onClick={() => onSelectCategory(sub.id)}
                               style={{ flex: 1, textAlign: 'left', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', backgroundColor: activeCategory === sub.id ? 'var(--chip-active)' : 'transparent', color: activeCategory === sub.id ? '#ffffff' : 'var(--text-secondary)', border: `1px solid ${activeCategory === sub.id ? 'var(--chip-active-border)' : 'transparent'}`, transition: 'all 0.2s', paddingRight: '50px', cursor: 'grab', display: 'flex', alignItems: 'center', gap: '6px' }}
                             >
                               ↳ {sub.name}
                               {subHasSelectedPrompts && <span style={{ color: 'var(--accent-color)', fontSize: '18px', lineHeight: '10px' }} title="Contains active prompts">•</span>}
                             </button>
                             <div style={{ position: 'absolute', right: '4px', display: 'flex', gap: '2px' }}>
                               <button onClick={(e) => startEdit(sub, e)} style={{ padding: '4px', color: 'rgba(255,255,255,0.3)' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'}>✎</button>
                               <button onClick={(e) => handleDelete(sub.id, e)} style={{ padding: '4px', color: 'rgba(239, 68, 68, 0.3)' }} onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = 'rgba(239, 68, 68, 0.3)'}>×</button>
                             </div>
                           </>
                        )}
                      </div>
                   )})}
                 </div>
               )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '20px', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="New Master Folder..." 
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            style={{ flex: 1, width: '100%' }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '8px 12px' }}>+</button>
        </form>

        <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={togglePin} className="btn-secondary" style={{ flex: '0 0 auto', fontSize: '14px', padding: '6px 12px', background: isPinned ? 'rgba(255,255,255,0.2)' : '' }} title="Always On Top">
             {isPinned ? '📍' : '📌'}
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ flex: '0 0 auto', fontSize: '14px', padding: '6px 10px' }} title="Set Wallpaper">🖼</button>
          <input type="file" ref={fileInputRef} onChange={handleWallpaperChange} accept="image/*" style={{ display: 'none' }} />
          <button onClick={onExport} className="btn-secondary" style={{ flex: 1, fontSize: '12px', padding: '6px' }} title="Full Deep Backup">↓ Backup</button>
          <button onClick={onImport} className="btn-secondary" style={{ flex: 1, fontSize: '12px', padding: '6px' }} title="Import Native Layout">↑ Restore</button>
        </div>
        
        {wallpaperUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>BG Blur</span>
            <input type="range" min="0" max="30" value={wallpaperBlur} onChange={e => onSetWallpaperBlur(e.target.value)} style={{ flex: 1, accentColor: 'var(--accent-color)' }} />
            <button onClick={() => onSetWallpaper(null)} style={{ fontSize: '10px', color: '#ef4444' }}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
}
