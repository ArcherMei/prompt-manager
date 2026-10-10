import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function PromptBuilder({ selectedPrompts, onRemovePrompt, onClear, isOpen, onToggleOpen }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');

  const rawString = selectedPrompts.map(p => p.text).join(', ');

  useEffect(() => {
    if (!isEditingPreview) {
      setPreviewText(rawString);
    }
  }, [rawString, isEditingPreview]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawString);
  };

  const handleCopyFromPreview = () => {
    navigator.clipboard.writeText(previewText);
  };

  return (
    <div style={{
      width: isOpen ? '300px' : '40px',
      flexShrink: 0,
      borderLeft: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'row',
      transition: 'width 0.3s ease',
      height: '100%',
      backgroundColor: 'var(--bg-sidebar)',
      position: 'relative'
    }} className="glass-panel">
      {/* Toggle Tab */}
      <div 
        onClick={onToggleOpen}
        style={{ width: '40px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px', borderRight: isOpen ? '1px solid var(--glass-border)' : 'none', flexShrink: 0 }}
      >
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.3s', fontSize: '18px' }}>◀</span>
        <div style={{ marginTop: '30px', transform: 'rotate(-90deg)', whiteSpace: 'nowrap', color: 'var(--text-secondary)', letterSpacing: '2px', fontSize: '12px', fontWeight: 'bold' }}>
          BUILDER
        </div>
      </div>

      {isOpen && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Built String</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={onClear} className="btn-secondary" style={{ flex: 1, padding: '6px 0', fontSize: '12px' }}>Clear</button>
              <button onClick={() => setIsPreviewOpen(true)} className="btn-secondary" style={{ flex: 1, padding: '6px 0', fontSize: '12px' }}>Preview</button>
              <button onClick={handleCopy} className="btn-primary" style={{ width: '100%', padding: '8px 0', fontSize: '13px' }}>📋 Copy</button>
            </div>
          </div>
          
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            {selectedPrompts.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
                Click on prompts to build...
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedPrompts.map(p => (
                   <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', alignItems: 'center', border: '1px solid var(--glass-border)' }}>
                     <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }} title={p.text}>{p.text}</span>
                     <button onClick={() => onRemovePrompt(p)} style={{ color: 'rgba(255,255,255,0.4)', padding: '0 4px', fontSize: '14px' }} onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>×</button>
                   </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Preview */}
      {isPreviewOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '40px' }}>
          <div className="glass-panel" style={{ width: '80vw', maxWidth: 'calc(80vh * 16 / 9)', height: '80vh', maxHeight: 'calc(80vw * 9 / 16)', padding: '32px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '500' }}>Prompt Preview</h2>
              <button onClick={() => { setIsPreviewOpen(false); setIsEditingPreview(false); }} style={{ fontSize: '28px', color: 'var(--text-secondary)', padding: '0 8px' }}>×</button>
            </div>

            {isEditingPreview ? (
              <textarea 
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                style={{ flex: 1, width: '100%', padding: '20px', fontFamily: 'monospace', fontSize: '15px', lineHeight: '1.6', borderRadius: '12px', border: '1px solid var(--accent-color)', background: 'rgba(0,0,0,0.4)', color: 'white', resize: 'none', outline: 'none' }}
              />
            ) : (
              <div style={{ flex: 1, padding: '20px', fontFamily: 'monospace', fontSize: '15px', lineHeight: '1.6', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowY: 'auto' }}>
                {previewText || <span style={{color: 'var(--text-secondary)'}}>No prompts selected...</span>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'space-between', marginTop: '12px' }}>
              <button 
                onClick={() => setIsEditingPreview(!isEditingPreview)} 
                className="btn-secondary"
                style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '500' }}
              >
                {isEditingPreview ? 'Lock Editing' : '✎ Edit Text'}
              </button>
              <button onClick={handleCopyFromPreview} className="btn-primary" style={{ padding: '12px 40px', fontSize: '14px', fontWeight: 'bold' }}>
                📋 Copy Prompt
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
