/**
 * BPMN Editor - Enhanced App Module
 * Features: Undo/Redo, Auto-save, Better UX, Accessibility
 */

(function() {
  // ──────────────────────────────────────────────────────────
  // UTILITY: Toast System with variants
  // ──────────────────────────────────────────────────────────
  const ToastManager = {
    container: document.getElementById('toastContainer'),
    
    show(msg, type = 'info', duration = 3000) {
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      
      const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
      };
      
      toast.innerHTML = `<i class="${iconMap[type]}"></i><span>${msg}</span>`;
      this.container.appendChild(toast);
      
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
    
    success: (msg, duration) => ToastManager.show(msg, 'success', duration),
    error: (msg, duration) => ToastManager.show(msg, 'error', duration || 5000),
    warning: (msg, duration) => ToastManager.show(msg, 'warning', duration || 4000),
    info: (msg, duration) => ToastManager.show(msg, 'info', duration)
  };

  // ──────────────────────────────────────────────────────────
  // UTILITY: Loading Overlay
  // ──────────────────────────────────────────────────────────
  const LoadingOverlay = {
    show(text = 'Loading...') {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.id = 'loadingOverlay';
      overlay.innerHTML = `
        <div style="text-align: center;">
          <div class="loading-spinner"></div>
          <div class="loading-text">${text}</div>
        </div>
      `;
      document.getElementById('canvasContainer').appendChild(overlay);
      return overlay;
    },
    
    hide() {
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.remove();
    }
  };

  // ──────────────────────────────────────────────────────────
  // UTILITY: Local Storage Manager
  // ──────────────────────────────────────────────────────────
  const StorageManager = {
    TABS_KEY: 'bpmn_editor_tabs',
    ACTIVE_TAB_KEY: 'bpmn_editor_active_tab',
    
    saveTabs(tabs, activeTabId) {
      try {
        localStorage.setItem(this.TABS_KEY, JSON.stringify(tabs));
        localStorage.setItem(this.ACTIVE_TAB_KEY, activeTabId);
      } catch (e) {
        console.warn('Storage quota exceeded or disabled', e);
      }
    },
    
    loadTabs() {
      try {
        const tabs = JSON.parse(localStorage.getItem(this.TABS_KEY) || '[]');
        const activeTabId = localStorage.getItem(this.ACTIVE_TAB_KEY);
        return { tabs, activeTabId };
      } catch (e) {
        console.warn('Failed to load tabs from storage', e);
        return { tabs: [], activeTabId: null };
      }
    },
    
    clear() {
      localStorage.removeItem(this.TABS_KEY);
      localStorage.removeItem(this.ACTIVE_TAB_KEY);
    }
  };

  // ──────────────────────────────────────────────────────────
  // BPMN Editor App
  // ──────────────────────────────────────────────────────────
  
  // bpmn-js modeler
  const canvasEl = document.getElementById('bpmnCanvas');
  const bpmnModeler = new BpmnJS({
    container: canvasEl,
    keyboard: { bindTo: document }
  });

  // DOM elements
  const tabBar = document.getElementById('tabBar');
  const xmlEditor = document.getElementById('xmlEditor');
  const codePanel = document.getElementById('codePanel');
  const toggleCodeBtn = document.getElementById('toggleCodeBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalCancel = document.getElementById('modalCancel');
  const modalConfirm = document.getElementById('modalConfirm');
  const previewCloseBtn = document.getElementById('previewCloseBtn');
  const canvasContainer = document.getElementById('canvasContainer');

  // Tab management
  let tabs = [];
  let activeTabId = null;
  let pendingCloseTabId = null;
  let autoSaveTimer = null;

  // Default empty diagram
  const emptyDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn"
  id="Definitions_1">
  <process id="Process_1" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start" />
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <omgdc:Bounds x="160" y="120" width="36" height="36" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

  const sampleDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_1">
  <process id="Process_1" isExecutable="true">
    <startEvent id="StartEvent_1" name="Order received">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <task id="Task_Check" name="Check availability">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </task>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_Check" />
    <exclusiveGateway id="Gateway_Avail" name="Available?">
      <incoming>Flow_2</incoming>
      <outgoing>Flow_Yes</outgoing>
      <outgoing>Flow_No</outgoing>
    </exclusiveGateway>
    <sequenceFlow id="Flow_2" sourceRef="Task_Check" targetRef="Gateway_Avail" />
    <task id="Task_Ship" name="Ship order">
      <incoming>Flow_Yes</incoming>
      <outgoing>Flow_Done</outgoing>
    </task>
    <sequenceFlow id="Flow_Yes" sourceRef="Gateway_Avail" targetRef="Task_Ship" />
    <sequenceFlow id="Flow_No" sourceRef="Gateway_Avail" targetRef="EndEvent_No" />
    <endEvent id="EndEvent_No" name="Out of stock">
      <incoming>Flow_No</incoming>
    </endEvent>
    <endEvent id="EndEvent_Done" name="Completed">
      <incoming>Flow_Done</incoming>
    </endEvent>
    <sequenceFlow id="Flow_Done" sourceRef="Task_Ship" targetRef="EndEvent_Done" />
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <omgdc:Bounds x="160" y="80" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Check_di" bpmnElement="Task_Check">
        <omgdc:Bounds x="250" y="58" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_Avail_di" bpmnElement="Gateway_Avail">
        <omgdc:Bounds x="420" y="73" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Ship_di" bpmnElement="Task_Ship">
        <omgdc:Bounds x="530" y="58" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_Done_di" bpmnElement="EndEvent_Done">
        <omgdc:Bounds x="700" y="80" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_No_di" bpmnElement="EndEvent_No">
        <omgdc:Bounds x="420" y="180" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <omgdi:waypoint x="196" y="98" />
        <omgdi:waypoint x="250" y="98" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <omgdi:waypoint x="350" y="98" />
        <omgdi:waypoint x="420" y="98" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Yes_di" bpmnElement="Flow_Yes">
        <omgdi:waypoint x="470" y="98" />
        <omgdi:waypoint x="530" y="98" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_No_di" bpmnElement="Flow_No">
        <omgdi:waypoint x="445" y="123" />
        <omgdi:waypoint x="445" y="180" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Done_di" bpmnElement="Flow_Done">
        <omgdi:waypoint x="630" y="98" />
        <omgdi:waypoint x="700" y="98" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

  // ──────────────────────────────────────────────────────────
  // Tab Helpers
  // ─────────��────────────────────────────────────────────────
  
  function generateId() { 
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); 
  }
  
  function createTab(name, xml) {
    return { id: generateId(), name: name || 'Diagram', xml: xml || emptyDiagram };
  }
  
  function addTab(name, xml, switchTo = true) {
    const tab = createTab(name, xml);
    tabs.push(tab);
    renderTabBar();
    if (switchTo) switchTab(tab.id);
    autoSave();
  }
  
  function removeTab(tabId) {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    if (tabs.length === 1) {
      ToastManager.warning('Cannot close the last tab.');
      return;
    }
    tabs.splice(index, 1);
    renderTabBar();
    if (activeTabId === tabId) {
      const newIndex = Math.min(index, tabs.length - 1);
      switchTab(tabs[newIndex].id);
    }
    autoSave();
  }
  
  async function switchTab(tabId) {
    if (activeTabId === tabId) return;
    await saveActiveTabXML();
    activeTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    xmlEditor.value = tab.xml;
    await renderDiagram(tab.xml);
    renderTabBar();
    autoSave();
  }
  
  async function saveActiveTabXML() {
    if (!activeTabId) return;
    try {
      const { xml } = await bpmnModeler.saveXML({ format: true });
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) tab.xml = xml;
    } catch (e) {
      console.warn('Could not save tab XML', e);
    }
  }
  
  async function renderDiagram(xml) {
    try {
      // Validate XML before import
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('Invalid XML format');
      }
      
      await bpmnModeler.importXML(xml);
      showEmptyStateIfNeeded();
    } catch (err) {
      showErrorModal('Failed to render diagram', err.message);
    }
  }
  
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[m]);
  }
  
  function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_\-. ]/g, '').replace(/\s+/g, '_').substring(0, 100) || 'diagram';
  }

  // ──────────────────────────────────────────────────────────
  // Empty State
  // ──────────────────────────────────────────────────────────
  
  function showEmptyStateIfNeeded() {
    const canvas = document.getElementById('bpmnCanvas');
    const hasElements = canvas.querySelector('[data-element-id]');
    
    if (!hasElements && !document.querySelector('.empty-state')) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <i class="fas fa-cube"></i>
        <p>No diagram elements yet</p>
        <div class="hint">Use the toolbar to create new elements or open an existing diagram</div>
      `;
      canvas.appendChild(emptyState);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Error Modal with Details
  // ──────────────────────────────────────────────────────────
  
  function showErrorModal(title, message, details = null) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-box">
        <h3><i class="fas fa-exclamation-circle" style="color: #dc2626;"></i> ${title}</h3>
        <p>${message}</p>
        ${details ? `<div class="error-details">${escapeHtml(details)}</div>` : ''}
        <button class="confirm-btn" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // ──────────────────────────────────────────────────────────
  // Auto-save
  // ──────────────────────────────────────────────────────────
  
  function autoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      StorageManager.saveTabs(tabs, activeTabId);
    }, 1000);
  }

  // ──────────────────────────────────────────────────────────
  // Undo/Redo (via bpmn-js commandStack)
  // ──────────────────────────────────────────────────────────
  
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      const commandStack = bpmnModeler.get('commandStack');
      if (commandStack.canUndo()) {
        commandStack.undo();
        ToastManager.info('Undo');
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' && e.shiftKey || e.key === 'y')) {
      e.preventDefault();
      const commandStack = bpmnModeler.get('commandStack');
      if (commandStack.canRedo()) {
        commandStack.redo();
        ToastManager.info('Redo');
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveActiveTabXML().then(() => ToastManager.success('Saved'));
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      document.getElementById('btnExportBPMN').click();
    }
  });

  // ──────────────────────────────────────────────────────────
  // Render Tab Bar
  // ──────────────────────────────────────────────────────────
  
  function renderTabBar() {
    tabBar.innerHTML = '';
    tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab${tab.id === activeTabId ? ' active' : ''}`;
      tabEl.setAttribute('data-tabid', tab.id);
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', tab.id === activeTabId ? 'true' : 'false');
      tabEl.setAttribute('tabindex', '0');
      tabEl.innerHTML = `
        <span class="tab-name" title="Double-click to rename">${escapeHtml(tab.name)}</span>
        <i class="fas fa-times close-btn" title="Close tab" aria-label="Close ${escapeHtml(tab.name)}"></i>
      `;
      
      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-btn')) return;
        switchTab(tab.id);
      });
      
      tabEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          switchTab(tab.id);
        }
      });
      
      tabEl.querySelector('.close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        pendingCloseTabId = tab.id;
        modalOverlay.classList.add('active');
      });
      
      const nameSpan = tabEl.querySelector('.tab-name');
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(tab, nameSpan);
      });
      
      tabBar.appendChild(tabEl);
    });
    
    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addBtn.title = 'New diagram tab (keyboard: Ctrl+Alt+N)';
    addBtn.setAttribute('aria-label', 'New diagram tab');
    addBtn.addEventListener('click', () => addTab('Diagram ' + (tabs.length + 1), emptyDiagram));
    tabBar.appendChild(addBtn);
  }

  function startRename(tab, span) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = tab.name;
    input.style.width = '120px';
    input.style.padding = '2px 4px';
    input.style.fontSize = '0.8rem';
    span.replaceWith(input);
    input.focus();
    input.select();
    
    const finish = () => {
      const newName = input.value.trim() || 'Untitled';
      tab.name = newName;
      renderTabBar();
      autoSave();
    };
    
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = tab.name; input.blur(); }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Modal Handlers
  // ──────────────────────────────────────────────────────────
  
  modalCancel.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
    pendingCloseTabId = null;
  });
  
  modalConfirm.addEventListener('click', () => {
    if (pendingCloseTabId) {
      removeTab(pendingCloseTabId);
      pendingCloseTabId = null;
    }
    modalOverlay.classList.remove('active');
  });

  // ──────────────────────────────────────────────────────────
  // Toolbar Actions
  // ──────────────────────────────────────────────────────────
  
  document.getElementById('newTabBtn').addEventListener('click', () => {
    addTab('Diagram ' + (tabs.length + 1), emptyDiagram);
  });

  document.getElementById('loadSampleBtn').addEventListener('click', () => {
    addTab('Sample Process', sampleDiagram);
  });

  document.getElementById('btnExportBPMN').addEventListener('click', async () => {
    const overlay = LoadingOverlay.show('Exporting BPMN...');
    try {
      await saveActiveTabXML();
      const tab = tabs.find(t => t.id === activeTabId);
      if (!tab) return;
      const blob = new Blob([tab.xml], { type: 'application/bpmn+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFilename(tab.name) + '.bpmn';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ToastManager.success('BPMN file downloaded');
    } catch (err) {
      ToastManager.error('Export failed: ' + err.message);
    } finally {
      LoadingOverlay.hide();
    }
  });

  document.getElementById('btnExportSVG').addEventListener('click', async () => {
    const overlay = LoadingOverlay.show('Exporting SVG...');
    try {
      const { svg } = await bpmnModeler.saveSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFilename(tabs.find(t => t.id === activeTabId)?.name || 'diagram') + '.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ToastManager.success('SVG exported');
    } catch (err) {
      ToastManager.error('SVG export failed: ' + err.message);
    } finally {
      LoadingOverlay.hide();
    }
  });

  // ──────────────────────────────────────────────────────────
  // Preview Mode
  // ────────────────────────────────────────────────────���─────
  
  function enterPreview() {
    document.body.classList.add('preview-mode');
    previewCloseBtn.style.display = 'block';
    ToastManager.info('Preview mode – press Esc or click Exit');
  }
  
  function exitPreview() {
    document.body.classList.remove('preview-mode');
    previewCloseBtn.style.display = 'none';
  }
  
  document.getElementById('btnPreview').addEventListener('click', enterPreview);
  previewCloseBtn.addEventListener('click', exitPreview);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('preview-mode')) {
      exitPreview();
    }
  });

  // ──────────────────────────────────────────────────────────
  // Open File
  // ──────────────────────────────────────────────────────────
  
  document.getElementById('openFileBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const name = file.name.replace(/\.(xml|bpmn)$/i, '');
        addTab(name, ev.target.result);
        ToastManager.success(`Loaded: ${name}`);
      } catch (err) {
        showErrorModal('Failed to load file', err.message);
      }
    };
    reader.onerror = () => {
      ToastManager.error('Failed to read file');
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ──────────────────────────────────────────────────────────
  // Code Panel Toggle
  // ──────────────────────────────────────────────────────────
  
  toggleCodeBtn.addEventListener('click', () => {
    codePanel.classList.toggle('collapsed');
    toggleCodeBtn.classList.toggle('active', !codePanel.classList.contains('collapsed'));
  });

  // ──────────────────────────────────────────────────────────
  // Code Panel Extra Buttons
  // ──────────────────────────────────────────────────────────
  
  document.getElementById('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      xmlEditor.value = text;
      ToastManager.success('Pasted from clipboard');
    } catch {
      ToastManager.error('Clipboard access denied');
    }
  });
  
  document.getElementById('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(xmlEditor.value);
      ToastManager.success('Code copied to clipboard');
    } catch {
      ToastManager.error('Copy failed');
    }
  });
  
  document.getElementById('clearBtn').addEventListener('click', () => {
    xmlEditor.value = '';
    ToastManager.info('Editor cleared');
  });
  
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    xmlEditor.select();
    ToastManager.info('All text selected');
  });

  // ──────────────────────────────────────────────────────────
  // Apply Code to Diagram
  // ──────────────────────────────────────────────────────────
  
  document.getElementById('applyCodeBtn').addEventListener('click', async () => {
    if (!activeTabId) return;
    const newXml = xmlEditor.value;
    try {
      const overlay = LoadingOverlay.show('Rendering XML...');
      await bpmnModeler.importXML(newXml);
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) tab.xml = newXml;
      ToastManager.success('Diagram updated from code');
      LoadingOverlay.hide();
      autoSave();
    } catch (err) {
      LoadingOverlay.hide();
      showErrorModal('Invalid XML', 'Failed to parse XML code', err.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // Resizable Code Panel
  // ──────────────────────────────────────────────────────────
  
  const resizeHandle = document.querySelector('.resize-handle');
  if (resizeHandle) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = codePanel.offsetWidth;
      document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newWidth = startWidth - (e.clientX - startX);
      codePanel.style.width = Math.max(200, Math.min(600, newWidth)) + 'px';
    });
    
    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.body.style.userSelect = '';
    });
  }

  // ──────────────────────────────────────────────────────────
  // Keyboard Shortcuts
  // ──────────────────────────────────────────────────────────
  
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'n') {
      e.preventDefault();
      addTab('Diagram ' + (tabs.length + 1), emptyDiagram);
      ToastManager.info('New tab created');
    }
  });

  // ──────────────────────────────────────────────────────────
  // Initialize
  // ──────────────────────────────────────────────────────────
  
  // Set accessibility attributes on header
  document.querySelector('.header').setAttribute('role', 'toolbar');
  document.querySelector('.header').setAttribute('aria-label', 'Main toolbar');
  
  // Load persisted tabs
  const { tabs: savedTabs, activeTabId: savedActiveTabId } = StorageManager.loadTabs();
  
  if (savedTabs.length > 0) {
    tabs = savedTabs;
    activeTabId = savedActiveTabId || savedTabs[0].id;
    renderTabBar();
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      xmlEditor.value = tab.xml;
      renderDiagram(tab.xml);
    }
    ToastManager.info('Loaded previous session');
  } else {
    const initialTab = createTab('Diagram 1', emptyDiagram);
    tabs.push(initialTab);
    activeTabId = initialTab.id;
    renderTabBar();
    xmlEditor.value = initialTab.xml;
    renderDiagram(initialTab.xml);
  }
  
  codePanel.classList.add('collapsed');
  toggleCodeBtn.classList.remove('active');

  window.addEventListener('resize', () => bpmnModeler.get('canvas').resized());

  // Auto-save on unload
  window.addEventListener('beforeunload', () => {
    autoSave();
  });
})();
