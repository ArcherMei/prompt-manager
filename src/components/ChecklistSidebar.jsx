import { useState } from 'react';

export default function ChecklistSidebar({ flowNodes, onUpdateFlowNodes }) {
  const [checkedFlows, setCheckedFlows] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  // Edit State buffers to handle purely internal UI inputs before pushing changes via Save
  const [editNodes, setEditNodes] = useState([]);

  const toggleMode = () => {
    if (isEditing) {
      // Transition to View -> Save Mode
      onUpdateFlowNodes(editNodes);
      setIsEditing(false);
    } else {
      // Transition to Edit Mode -> Copy from props
      setEditNodes([...(flowNodes || [])]);
      setIsEditing(true);
    }
  };

  const handleToggle = (id) => {
    if (isEditing) return; // Disallow checking boxes while editing the layout
    if (checkedFlows.includes(id)) setCheckedFlows(checkedFlows.filter(x => x !== id));
    else setCheckedFlows([...checkedFlows, id]);
  };

  // -------------------------------------
  // Dynamic Modifiers
  // -------------------------------------
  const updateNode = (id, field, value) => {
    setEditNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  const deleteNode = (id) => {
    setEditNodes(prev => prev.filter(n => n.id !== id));
  };

  const moveNode = (index, direction) => {
    if (index === 0 && direction === -1) return;
    if (index === editNodes.length - 1 && direction === 1) return;

    const newArr = [...editNodes];
    const targetIndex = index + direction;
    // Swap
    [newArr[index], newArr[targetIndex]] = [newArr[targetIndex], newArr[index]];
    setEditNodes(newArr);
  };

  const addNode = () => {
    const newNode = {
      id: `f-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      title: '',
      desc: ''
    };
    setEditNodes([...editNodes, newNode]);
  };

  // Protection from undefined states if parsing old JSON without defaults explicitly hit
  const safeNodes = isEditing ? editNodes : (flowNodes || []);

  return (
    <div style={{
      height: '180px',
      background: 'var(--bg-main)',
      borderTop: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      overflow: 'hidden',
      flexShrink: 0
    }}>
      <div style={{ padding: '24px 16px 16px 16px', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '0.5px', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋</span> Prompt Flow
          </h2>
          <button 
             onClick={toggleMode}
             style={{
                fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
                background: isEditing ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                color: 'white', border: 'none', cursor: 'pointer', transition: 'all 0.2s'
             }}
          >
             {isEditing ? 'Save Layout' : '⚙ Edit'}
          </button>
        </div>
        {!isEditing && (
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>
            Follow standard architectural pillars to build highly deterministic image outputs.
          </p>
        )}
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '16px', display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'stretch' }}>
        {safeNodes.length === 0 && !isEditing && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', fontStyle: 'italic' }}>
            No checklist items generated. Click Edit to create your first structural node!
          </p>
        )}

        {safeNodes.map((node, index) => {
          const isDone = !isEditing && checkedFlows.includes(node.id);
          
          if (isEditing) {
            // EDIT MODE
            return (
              <div key={node.id} style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', minWidth: '260px', flexShrink: 0 }}>
                {/* Arrow Controllers */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                  <button onClick={() => moveNode(index, -1)} style={{ background: 'rgba(255,255,255,0.05)', color: index === 0 ? 'rgba(255,255,255,0.1)' : 'white', border: 'none', borderRadius: '4px', cursor: index === 0 ? 'default' : 'pointer', padding: '4px', fontSize: '10px' }} disabled={index === 0}>◀</button>
                  <button onClick={() => moveNode(index, 1)} style={{ background: 'rgba(255,255,255,0.05)', color: index === editNodes.length - 1 ? 'rgba(255,255,255,0.1)' : 'white', border: 'none', borderRadius: '4px', cursor: index === editNodes.length - 1 ? 'default' : 'pointer', padding: '4px', fontSize: '10px' }} disabled={index === editNodes.length - 1}>▶</button>
                </div>
                {/* Editor Content */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <input 
                    type="text" value={node.title} onChange={e => updateNode(node.id, 'title', e.target.value)} 
                    placeholder="Step Title..." style={{ padding: '6px 8px', fontSize: '12px', width: '100%', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} 
                  />
                  <input 
                    type="text" value={node.desc} onChange={e => updateNode(node.id, 'desc', e.target.value)} 
                    placeholder="Short description..." style={{ padding: '6px 8px', fontSize: '11px', width: '100%', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} 
                  />
                </div>
                {/* Delete Sequence */}
                <button 
                  onClick={() => deleteNode(node.id)}
                  style={{ color: 'rgba(255,255,255,0.3)', padding: '0 4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                  onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'}
                >×</button>
              </div>
            );
          } else {
            // VIEW MODE
            return (
              <div 
                key={node.id} 
                onClick={() => handleToggle(node.id)}
                style={{
                  display: 'flex', gap: '10px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                  backgroundColor: isDone ? 'rgba(0,0,0,0.2)' : 'var(--chip-bg)',
                  border: isDone ? '1px solid var(--glass-border)' : '1px solid transparent',
                  opacity: isDone ? 0.6 : 1,
                  minWidth: '220px', maxWidth: '300px', flexShrink: 0, alignItems: 'flex-start'
                }}
              >
                <div style={{ 
                   width: '16px', height: '16px', borderRadius: '4px', border: '1px solid var(--accent-color)', 
                   flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                   background: isDone ? 'var(--accent-color)' : 'transparent'
                }}>
                   {isDone && <span style={{ color: 'white', fontSize: '10px', lineHeight: '10px' }}>✓</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', fontWeight: '500', color: isDone ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none' }}>
                    {node.title}
                  </span>
                  {node.desc && (
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.2' }}>
                      {node.desc}
                    </span>
                  )}
                </div>
              </div>
            );
          }
        })}

        {isEditing && (
          <button 
            onClick={addNode} 
            style={{ 
              minWidth: '160px', padding: '10px', borderRadius: '8px', border: '1px dashed var(--accent-color)', 
              background: 'transparent', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '12px', fontWeight: '500', flexShrink: 0 
            }}
          >
            + Add Step
          </button>
        )}
      </div>

    </div>
  );
}
