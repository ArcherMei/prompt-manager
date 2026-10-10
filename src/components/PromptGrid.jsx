import { useState } from 'react';

export default function PromptGrid({ categoryName, isRoot, prompts, selectedPrompts, onToggleSelection, onCreatePrompt, onEditPrompt, onDeletePrompt, onExportCategory, onClearCategorySelection }) {
  const [newPromptText, setNewPromptText] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [newSubNoteText, setNewSubNoteText] = useState('');
  const [newExtraTagText, setNewExtraTagText] = useState('');
  
  const [promptSearchQuery, setPromptSearchQuery] = useState('');
  const [noteSearchQuery, setNoteSearchQuery] = useState('');

  const [editingPromptId, setEditingPromptId] = useState(null);
  const [editPromptText, setEditPromptText] = useState('');
  const [editNoteText, setEditNoteText] = useState('');
  const [editSubNoteText, setEditSubNoteText] = useState('');
  const [editExtraTagText, setEditExtraTagText] = useState('');

  const [showTags, setShowTags] = useState(false);

  const handleAdd = (e) => {
    e.preventDefault();
    if (newPromptText.trim()) {
      onCreatePrompt(newPromptText, newNoteText, newSubNoteText, newExtraTagText);
      setNewPromptText('');
      // Notes and SubNotes deliberately remain uncleared for rapid LoRA batching!
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
       e.preventDefault();
       handleAdd(e);
    }
  };

  const startEdit = (p, e) => {
    e.stopPropagation();
    setEditingPromptId(p.id);
    setEditPromptText(p.text);
    setEditNoteText(p.note || '');
    setEditSubNoteText(p.subNote || '');
    setEditExtraTagText(p.extraTag || '');
  };

  const saveEdit = (e) => {
    e.preventDefault();
    if (editPromptText.trim()) {
      onEditPrompt(editingPromptId, editPromptText, editNoteText, editSubNoteText, editExtraTagText);
      setEditingPromptId(null);
    }
  };

  const promptTokens = promptSearchQuery.split(/[\s,]+/).filter(t => t.trim() !== '');
  const noteTokens = noteSearchQuery.split(/[\s,]+/).filter(t => t.trim() !== '');

  const filteredPrompts = prompts.filter(p => {
    const textMatch = promptTokens.length === 0 || promptTokens.every(token => p.text.toLowerCase().includes(token.toLowerCase()));
    const combinedNotes = ((p.note || '') + ' ' + (p.subNote || '')).toLowerCase();
    const noteMatch = noteTokens.length === 0 || noteTokens.every(token => combinedNotes.includes(token.toLowerCase()));
    return textMatch && noteMatch;
  });

  // Calculate dynamic history tags for 1-click Quick Tags
  const defaultChips = ['chara', 'chara+outfits', 'accessories', 'style'];
  const dbNotes = prompts.map(p => p.note).filter(Boolean);
  const uniqueChips = [...new Set([...defaultChips, ...dbNotes])].slice(0, 12);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      
      {/* 1. Header Array - Fixed Height / No Scroll */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '32px 32px 24px 32px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' }}>
           <h1 style={{ fontSize: '24px', fontWeight: '500', margin: 0 }}>{categoryName || 'Select a Category'}</h1>
           
           {categoryName && isRoot && (
              <button 
                onClick={onExportCategory} 
                className="btn-secondary" 
                style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '4px' }}
                title="Export this Master Folder and all its subs"
              >
                ⤓ Export Entire Tree
              </button>
           )}
           {categoryName && (
              <button 
                onClick={onClearCategorySelection} 
                className="btn-secondary" 
                style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5' }}
                title="Clear selected prompts within this active category"
              >
                × Clear Grid Selection
              </button>
           )}
        </div>
        
        {categoryName && (
           <div style={{ display: 'flex', gap: '12px' }}>
             <div style={{ position: 'relative' }}>
               <input type="text" placeholder="🔍 Search strings..." value={promptSearchQuery} onChange={(e) => setPromptSearchQuery(e.target.value)} title="Type keywords separated by spaces or commas" style={{ width: '220px', padding: '8px 28px 8px 16px', fontSize: '13px', borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: promptSearchQuery ? '1px solid var(--accent-color)' : '1px solid var(--glass-border)', outline: 'none' }} />
               {promptSearchQuery && <button onClick={() => setPromptSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}>×</button>}
             </div>
             <div style={{ position: 'relative' }}>
               <input type="text" placeholder="🔍 Search notes / files..." value={noteSearchQuery} onChange={(e) => setNoteSearchQuery(e.target.value)} title="Search exclusively in notes and sub-note file logic" style={{ width: '220px', padding: '8px 28px 8px 16px', fontSize: '13px', borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: noteSearchQuery ? '1px solid var(--accent-color)' : '1px solid var(--glass-border)', outline: 'none' }} />
               {noteSearchQuery && <button onClick={() => setNoteSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}>×</button>}
             </div>
           </div>
        )}
      </div>

      {/* 2. Grid Mapping - Active Overflow Auto */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px 32px' }}>
        {categoryName ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: '12px' }}>
            {filteredPrompts.length === 0 && (promptSearchQuery || noteSearchQuery) && (
               <p style={{ color: 'var(--text-secondary)' }}>No matches found for your active filters.</p>
            )}
            {filteredPrompts.map(p => {
              const isSelected = selectedPrompts.find(sp => sp.id === p.id);
              return (
                <div 
                  key={p.id}
                  onClick={() => onToggleSelection(p)}
                  style={{ position: 'relative', padding: '12px 20px', borderRadius: '10px', backgroundColor: isSelected ? 'var(--chip-active)' : 'var(--chip-bg)', border: `1px solid ${isSelected ? 'var(--chip-active-border)' : 'var(--glass-border)'}`, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px', userSelect: 'none', minWidth: '220px' }}
                  className="glass-panel"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ color: isSelected ? 'white' : 'var(--text-primary)', fontWeight: '500', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {p.text}
                    </span>
                    {p.note && (
                      <span style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)', fontSize: '12px', marginTop: '6px' }}>{p.note}</span>
                    )}
                    {p.subNote && (
                      <span style={{ color: isSelected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', fontSize: '10px', marginTop: '2px', fontFamily: 'monospace', letterSpacing: '0.2px' }}>↳ {p.subNote}</span>
                    )}
                    {p.extraTag && (
                      <span style={{ display: 'inline-block', backgroundColor: 'var(--chip-bg)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', marginTop: '6px', alignSelf: 'flex-start', border: '1px solid var(--glass-border)' }}>{p.extraTag}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button onClick={(e) => { e.stopPropagation(); onCreatePrompt(p.text, p.note, p.subNote, p.extraTag); }} style={{ color: 'rgba(255,255,255,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }} onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'} title="Clone Prompt">⎘</button>
                    <button onClick={(e) => startEdit(p, e)} style={{ color: 'rgba(255,255,255,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }} onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'} title="Edit Prompt">✎</button>
                    <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Are you absolutely sure you want to delete this specific prompt?')) onDeletePrompt(p.id); }} style={{ color: 'rgba(255,255,255,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '18px', lineHeight: '14px' }} onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'} title="Delete Prompt">×</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
             <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Please select or create a category folder to begin.</p>
          </div>
        )}
      </div>

      {/* 3. Sticky Input Form - Pinned Bottom (Flex Shrink 0) */}
      {categoryName && (
        <div style={{ padding: '20px 32px', borderTop: '1px solid var(--glass-border)', flexShrink: 0, background: 'var(--bg-main)' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <div style={{ flex: 3, position: 'relative' }}>
                <textarea 
                  placeholder="Content string (e.g. <lora:cyberpunk:1.0>)...&#10;Press Enter to save, Shift+Enter for newlines!" 
                  value={newPromptText}
                  onChange={(e) => setNewPromptText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ width: '100%', padding: '12px 28px 12px 16px', fontSize: '14px', fontFamily: 'monospace', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', resize: 'vertical', minHeight: '70px', outline: 'none' }}
                />
                {newPromptText && (
                   <button type="button" onClick={() => setNewPromptText('')} style={{ position: 'absolute', right: '8px', top: '8px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'} title="Clear Prompt String">×</button>
                )}
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                 <div style={{ position: 'relative', width: '100%' }}>
                    <input type="text" placeholder="Main Note (e.g. Art Style)" value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} style={{ width: '100%', padding: '10px 28px 10px 14px', fontSize: '13px' }} />
                    {newNoteText && (
                       <button type="button" onClick={() => setNewNoteText('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'} title="Clear Main Note">×</button>
                    )}
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '-4px' }}>
                    <button type="button" onClick={() => setShowTags(!showTags)} style={{ fontSize: '10px', color: showTags ? 'var(--accent-color)' : 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                       {showTags ? 'Hide History Tags ▲' : 'Show History Tags ▼'}
                    </button>
                 </div>
                 {showTags && (
                   <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '2px' }}>
                      {uniqueChips.map(chip => (
                         <button 
                           type="button" key={chip} onClick={() => setNewNoteText(chip)} 
                           style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', transition: 'all 0.1s' }} 
                           onMouseEnter={e => { e.target.style.background='var(--accent-color)'; e.target.style.color='white'; }} 
                           onMouseLeave={e => { e.target.style.background='rgba(255,255,255,0.1)'; e.target.style.color='rgba(255,255,255,0.7)'; }}
                         >
                           {chip}
                         </button>
                      ))}
                   </div>
                 )}
                 <div style={{ display: 'flex', gap: '8px' }}>
                   <div style={{ position: 'relative', flex: 1 }}>
                     <input type="text" placeholder="Sub-Note (LoRA Info)" value={newSubNoteText} onChange={(e) => setNewSubNoteText(e.target.value)} style={{ width: '100%', padding: '10px 28px 10px 14px', fontSize: '13px', fontFamily: 'monospace', opacity: 0.8 }} />
                     {newSubNoteText && (
                        <button type="button" onClick={() => setNewSubNoteText('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'} title="Clear Sub-Note">×</button>
                     )}
                   </div>
                   <div style={{ position: 'relative', flex: 1 }}>
                     <input type="text" placeholder="Complex LoRA Tag" value={newExtraTagText} onChange={(e) => setNewExtraTagText(e.target.value)} style={{ width: '100%', padding: '10px 28px 10px 14px', fontSize: '13px', fontFamily: 'monospace', opacity: 0.8 }} />
                     {newExtraTagText && (
                        <button type="button" onClick={() => setNewExtraTagText('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'} title="Clear Tag">×</button>
                     )}
                   </div>
                 </div>
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '0 24px', fontWeight: 'bold' }}>Drop File</button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Editor Modal Overlay */}
      {editingPromptId && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="glass-panel" style={{ width: '600px', maxWidth: '90%', padding: '32px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '500' }}>Edit Prompt</h2>
            <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Prompt String</label>
                <textarea autoFocus value={editPromptText} onChange={(e) => setEditPromptText(e.target.value)} style={{ width: '100%', padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace', borderRadius: '8px', border: '1px solid var(--accent-color)', background: 'rgba(0,0,0,0.3)', color: 'white', resize: 'vertical', minHeight: '120px' }} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Main Note</label>
                  <div style={{ position: 'relative', width: '100%' }}>
                     <input type="text" value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)} style={{ width: '100%', padding: '10px 28px 10px 14px', fontSize: '13px' }} />
                     {editNoteText && (
                        <button type="button" onClick={() => setEditNoteText('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'} title="Clear Main Note">
                           ×
                        </button>
                     )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '-4px' }}>
                     <button type="button" onClick={() => setShowTags(!showTags)} style={{ fontSize: '10px', color: showTags ? 'var(--accent-color)' : 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        {showTags ? 'Hide History Tags ▲' : 'Show History Tags ▼'}
                     </button>
                  </div>
                  {showTags && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {uniqueChips.map(chip => (
                         <button 
                           type="button" key={chip} onClick={() => setEditNoteText(chip)} 
                           style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', transition: 'all 0.1s' }}
                           onMouseEnter={e => { e.target.style.background='var(--accent-color)'; e.target.style.color='white'; }} 
                           onMouseLeave={e => { e.target.style.background='rgba(255,255,255,0.1)'; e.target.style.color='rgba(255,255,255,0.7)'; }}
                         >
                           {chip}
                         </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Notes & Tags</label>
                  <div style={{ position: 'relative', width: '100%', marginBottom: '8px' }}>
                    <input type="text" placeholder="Sub-Note" value={editSubNoteText} onChange={(e) => setEditSubNoteText(e.target.value)} style={{ width: '100%', padding: '10px 28px 10px 14px', fontSize: '13px', fontFamily: 'monospace' }} />
                    {editSubNoteText && (
                        <button type="button" onClick={() => setEditSubNoteText('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>×</button>
                    )}
                  </div>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input type="text" placeholder="Complex LoRA Tag" value={editExtraTagText} onChange={(e) => setEditExtraTagText(e.target.value)} style={{ width: '100%', padding: '10px 28px 10px 14px', fontSize: '13px', fontFamily: 'monospace' }} />
                    {editExtraTagText && (
                        <button type="button" onClick={() => setEditExtraTagText('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>×</button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setEditingPromptId(null)} className="btn-secondary" style={{ padding: '10px 24px' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 24px' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
