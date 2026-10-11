import { useState, useEffect } from 'react';
import './index.css';
import Sidebar from './components/Sidebar';
import PromptGrid from './components/PromptGrid';
import PromptBuilder from './components/PromptBuilder';
import ChecklistSidebar from './components/ChecklistSidebar';
import Repository from './components/Repository';
import LoraManager from './components/LoraManager';
import Updates from './components/Updates';

function App() {
  const [data, setData] = useState({ categories: [], prompts: [], flowNodes: [], wallpaperUrl: null, wallpaperBlur: 0 });

  const defaultFlows = [
    { id: 'f-1', title: 'Core Subject', desc: 'Main character, object, or entity' },
    { id: 'f-2', title: 'Subject Description', desc: 'Clothes, hair, emotions, mechanics' },
    { id: 'f-3', title: 'Action / Pose', desc: 'What is the subject doing?' },
    { id: 'f-4', title: 'Environment', desc: 'Background layout, time of day' },
    { id: 'f-5', title: 'Camera & Lighting', desc: 'Angles, cinematic, studio light' },
    { id: 'f-6', title: 'Art Style / Medium', desc: 'Anime, oil painting, 3D render' },
    { id: 'f-7', title: 'Post-Processing', desc: '8k, highly detailed, masterpiece' },
    { id: 'f-8', title: 'LoRA / Network Drives', desc: 'Injected model pathways' }
  ];

  const [activeCategory, setActiveCategory] = useState(null);
  const [view, setView] = useState('prompts');
  const [selectedPrompts, setSelectedPrompts] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      if (window.api) {
        const dbData = await window.api.getData();
        setData({
          categories: dbData.categories || [],
          prompts: dbData.prompts || [],
          flowNodes: dbData.flowNodes || defaultFlows,
          wallpaperUrl: dbData.wallpaperUrl || null,
          wallpaperBlur: dbData.wallpaperBlur || 0
        });
        if (dbData.categories && dbData.categories.length > 0) setActiveCategory(dbData.categories[0].id);
      } else {
        const mock = {
          categories: [
            { id: 'cat-1', name: 'Art Style', parentId: null },
            { id: 'cat-3', name: 'Watercolor', parentId: 'cat-1' },
            { id: 'cat-2', name: 'Subject', parentId: null }
          ],
          prompts: [
            { id: 'p-1', categoryId: 'cat-1', text: 'cyberpunk', note: '' },
            { id: 'p-3', categoryId: 'cat-3', text: 'wet on wet technique', note: 'Brush stroke' },
            { id: 'p-2', categoryId: 'cat-2', text: '<lora:add_detail:1.0>', note: 'Enhance details natively' }
          ],
          flowNodes: defaultFlows,
          wallpaperUrl: null,
          wallpaperBlur: 0
        };
        setData(mock);
        setActiveCategory('cat-1');
      }
    };
    loadData();
  }, []);

  const saveData = async (newData) => {
    setData(newData);
    if (window.api) {
      await window.api.saveData(newData);
    }
  };

  const handleExport = async () => {
    if (window.api && window.api.exportData) {
      await window.api.exportData(data);
    } else {
      alert("Export only available in the compiled Desktop application.");
    }
  };

  const handleExportCategory = async () => {
    if (!activeCategory) return;
    
    // Deep Export Logic: Grab Parent AND its Sub-Categories
    const catObj = data.categories.find(c => c.id === activeCategory);
    let exportCats = [catObj];
    
    // If it's a root category, package its children too
    if (!catObj.parentId) {
      const children = data.categories.filter(c => c.parentId === activeCategory);
      exportCats = [...exportCats, ...children];
    }

    const catIds = exportCats.map(c => c.id);
    const catPrompts = data.prompts.filter(p => catIds.includes(p.categoryId));
    
    if (window.api && window.api.exportCategory) {
      await window.api.exportCategory({ categories: exportCats, prompts: catPrompts, flowNodes: data.flowNodes }, catObj.name);
    } else {
      alert("Export only available in the compiled Desktop application.");
    }
  };

  const handleImport = async () => {
    if (window.api && window.api.importData) {
      const res = await window.api.importData();
      if (res && res.success) {
        const imported = res.data;
        let newData = { ...data };
        let importCount = 0;
        let jumpToCat = null;
        let idMap = {};
        
        if (imported.categories && imported.prompts) {
          const sortedCats = [...imported.categories].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));

          sortedCats.forEach(importedCat => {
            let targetCat;
            if (!importedCat.parentId) {
              targetCat = newData.categories.find(c => !c.parentId && c.name.toLowerCase() === importedCat.name.toLowerCase());
            } else {
              const newParentId = idMap[importedCat.parentId];
              targetCat = newData.categories.find(c => c.parentId === newParentId && c.name.toLowerCase() === importedCat.name.toLowerCase());
            }

            let targetCatId = '';
            if (targetCat) {
              targetCatId = targetCat.id;
            } else {
              targetCatId = `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
              newData.categories.push({ 
                id: targetCatId, 
                name: importedCat.name,
                parentId: importedCat.parentId ? idMap[importedCat.parentId] : null
              });
            }
            idMap[importedCat.id] = targetCatId;
            if (!jumpToCat && !importedCat.parentId) jumpToCat = targetCatId; 

            const categoryPrompts = imported.prompts.filter(p => p.categoryId === importedCat.id);
            categoryPrompts.forEach(importedPrompt => {
               const isDuplicate = newData.prompts.some(p => p.categoryId === targetCatId && p.text === importedPrompt.text);
               if (!isDuplicate) {
                  newData.prompts.push({
                     id: `p-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                     categoryId: targetCatId,
                     text: importedPrompt.text,
                     note: importedPrompt.note || '',
                     subNote: importedPrompt.subNote || '',
                     extraTag: importedPrompt.extraTag || ''
                  });
                  importCount++;
               }
            });
          });
        }
        
        // Dynamically override Flow Nodes if the backup specifically contains them
        if (imported.flowNodes) newData.flowNodes = imported.flowNodes;

        saveData(newData);
        if (jumpToCat) setActiveCategory(jumpToCat);
        alert(`Successfully imported ${importCount} new prompts! Multi-level tree maintained and exact duplicates skipped.`);
      }
    } else {
      alert("Import only available in the compiled Desktop application.");
    }
  };

  const handleCreateCategory = (name) => {
    const newCat = { id: `cat-${Date.now()}`, name, parentId: null };
    saveData({ ...data, categories: [...data.categories, newCat] });
    setActiveCategory(newCat.id);
  };

  const handleCreateSubCategory = (parentId, name) => {
    const newCat = { id: `cat-${Date.now()}`, name, parentId };
    saveData({ ...data, categories: [...data.categories, newCat] });
    setActiveCategory(newCat.id);
  };

  const handleRenameCategory = (id, newName) => {
    const newCategories = data.categories.map(c => c.id === id ? { ...c, name: newName } : c);
    saveData({ ...data, categories: newCategories });
  };

  const handleReorderCategory = (sourceId, targetId) => {
    if (sourceId === targetId) return;
    const newCategories = [...data.categories];
    const sourceIndex = newCategories.findIndex(c => c.id === sourceId);
    if (sourceIndex < 0) return;
    
    // Snag the source object safely
    const [movedCat] = newCategories.splice(sourceIndex, 1);
    
    // Find absolute target positioning after array morphs
    let targetIndex = newCategories.findIndex(c => c.id === targetId);
    if (targetIndex < 0) targetIndex = newCategories.length;
    
    newCategories.splice(targetIndex, 0, movedCat);
    saveData({ ...data, categories: newCategories });
  };

  const handleDeleteCategory = (id) => {
    const childrenNodes = data.categories.filter(c => c.parentId === id).map(c => c.id);
    const nodesToPurge = [id, ...childrenNodes];

    const newCategories = data.categories.filter(c => !nodesToPurge.includes(c.id));
    const newPrompts = data.prompts.filter(p => !nodesToPurge.includes(p.categoryId));
    
    saveData({ ...data, categories: newCategories, prompts: newPrompts });
    if (nodesToPurge.includes(activeCategory)) {
       setActiveCategory(newCategories.length > 0 ? newCategories[0].id : null);
    }
    setSelectedPrompts(prev => prev.filter(sp => newPrompts.find(p => p.id === sp.id)));
  };

  const handleCreatePrompt = (text, note, subNote, extraTag) => {
    if (!activeCategory || !text.trim()) return;
    const newPrompt = { id: `p-${Date.now()}`, categoryId: activeCategory, text, note: note || '', subNote: subNote || '', extraTag: extraTag || '' };
    saveData({ ...data, prompts: [...data.prompts, newPrompt] });
  };

  const handleEditPrompt = (id, newText, newNote, newSubNote, newExtraTag) => {
    const newPrompts = data.prompts.map(p => p.id === id ? { ...p, text: newText, note: newNote, subNote: newSubNote, extraTag: newExtraTag } : p);
    
    // Also intelligently update the selectedPrompts if the user edited a prompt currently sitting in their Builder tray
    setSelectedPrompts(prev => prev.map(p => p.id === id ? { ...p, text: newText, note: newNote, subNote: newSubNote, extraTag: newExtraTag } : p));
    
    saveData({ ...data, prompts: newPrompts });
  };

  const deletePrompt = (id) => {
    saveData({ ...data, prompts: data.prompts.filter(p => p.id !== id) });
    setSelectedPrompts(prev => prev.filter(p => p.id !== id));
  };

  const togglePromptSelection = (prompt) => {
    setSelectedPrompts(prev => {
      const exists = prev.find(p => p.id === prompt.id);
      if (exists) return prev.filter(p => p.id !== prompt.id);
      return [...prev, prompt];
    });
  };

  const handleClearCategorySelection = () => {
    if (!activeCategory) return;
    const idsInCategory = data.prompts.filter(p => p.categoryId === activeCategory).map(p => p.id);
    setSelectedPrompts(prev => prev.filter(p => !idsInCategory.includes(p.id)));
  };

  const [isBuilderOpen, setIsBuilderOpen] = useState(true);

  const activeCategoryObject = data.categories.find(c => c.id === activeCategory);
  
  // Breadcrumb Trail Generation
  let breadcrumbName = '';
  if (activeCategoryObject) {
     if (activeCategoryObject.parentId) {
        const parent = data.categories.find(c => c.id === activeCategoryObject.parentId);
        breadcrumbName = parent ? `${parent.name} > ${activeCategoryObject.name}` : activeCategoryObject.name;
     } else {
        breadcrumbName = activeCategoryObject.name;
     }
  }

  return (
    <>
      {data.wallpaperUrl ? (
        <div style={{
          position: 'fixed', top: '-60px', left: '-60px', right: '-60px', bottom: '-60px', 
          backgroundImage: `url(${data.wallpaperUrl})`, 
          backgroundSize: 'cover', 
          backgroundPosition: 'center', 
          filter: `blur(${data.wallpaperBlur}px)`,
          zIndex: -1,
          backgroundColor: '#0f1115'
        }} />
      ) : (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0f1115', zIndex: -1 }} />
      )}
      <div className="app-container">
        <Sidebar 
          view={view}
          onChangeView={setView}
          categories={data.categories} 
        activeCategory={activeCategory}
        selectedPrompts={selectedPrompts}
        onSelectCategory={(id) => { setActiveCategory(id); setView('prompts'); }}
        onCreateCategory={handleCreateCategory}
        onCreateSubCategory={handleCreateSubCategory}
        onRenameCategory={handleRenameCategory}
        onReorderCategory={handleReorderCategory}
        onDeleteCategory={handleDeleteCategory}
        onExport={handleExport}
        onImport={handleImport}
        wallpaperUrl={data.wallpaperUrl}
        wallpaperBlur={data.wallpaperBlur}
        onSetWallpaper={(url) => saveData({ ...data, wallpaperUrl: url })}
        onSetWallpaperBlur={(val) => saveData({ ...data, wallpaperBlur: val })}
      />
      <div className="main-content">
        {view === 'updates' ? <Updates /> : view === 'lora-manager' ? <LoraManager prompts={data.prompts} categories={data.categories} /> : view !== 'prompts' ? <Repository onManage={() => setView('lora-manager')} key={view} view={view} prompts={data.prompts} categories={data.categories} selectedPrompts={selectedPrompts} onToggleSelection={togglePromptSelection} onOpenPrompt={(prompt) => { setActiveCategory(prompt.categoryId); setView('prompts'); }} /> : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PromptGrid 
            categoryName={breadcrumbName}
            isRoot={activeCategoryObject && !activeCategoryObject.parentId}
            prompts={data.prompts.filter(p => p.categoryId === activeCategory)}
            selectedPrompts={selectedPrompts}
            onToggleSelection={togglePromptSelection}
            onCreatePrompt={handleCreatePrompt}
            onEditPrompt={handleEditPrompt}
            onDeletePrompt={deletePrompt}
            onExportCategory={handleExportCategory}
            onClearCategorySelection={handleClearCategorySelection}
          />
          <ChecklistSidebar 
            flowNodes={data.flowNodes}
            onUpdateFlowNodes={(newNodes) => saveData({ ...data, flowNodes: newNodes })}
          />
        </div>
        )}
      </div>
      <PromptBuilder 
        selectedPrompts={selectedPrompts} 
        onClear={() => setSelectedPrompts([])} 
        onRemovePrompt={togglePromptSelection}
        isOpen={view === 'prompts' && isBuilderOpen}
        onToggleOpen={() => setIsBuilderOpen(!isBuilderOpen)}
      />
    </div>
    </>
  );
}

export default App;
