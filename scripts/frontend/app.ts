import { Editor } from './editor.js';
import { renderMarkdown } from './preview.js';
import { Sidebar } from './sidebar.js';

type ViewMode = 'edit' | 'preview' | 'split';

interface AppState {
  viewMode: ViewMode;
  currentFilePath: string | null;
  isDirty: boolean;
  isSaving: boolean;
}

const state: AppState = {
  viewMode: 'split',
  currentFilePath: null,
  isDirty: false,
  isSaving: false,
};

let editor: Editor;
let sidebar: Sidebar;

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function updatePreview(content: string): void {
  const previewContent = getElement('preview-content');
  // NOTE: renderMarkdown processes the user's own local MEMORY.md files only.
  // This editor runs on localhost and only reads files under ~/.claude/ - no untrusted content.
  const rendered = renderMarkdown(content);
  previewContent.textContent = '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = rendered; // safe: content is from user's own local files only
  while (wrapper.firstChild) {
    previewContent.appendChild(wrapper.firstChild);
  }
}

function updateStatusBar(): void {
  const statusText = getElement('status-text');
  const lineCount = getElement('line-count');
  const fileInfo = getElement('file-info');

  if (state.isSaving) {
    statusText.textContent = 'Saving...';
    statusText.className = 'status-saving';
  } else if (state.isDirty) {
    statusText.textContent = 'Modified';
    statusText.className = 'status-modified';
  } else if (state.currentFilePath) {
    statusText.textContent = 'Saved';
    statusText.className = 'status-saved';
  } else {
    statusText.textContent = 'Ready';
    statusText.className = '';
  }

  lineCount.textContent = `Lines: ${editor ? editor.getLineCount() : 0}`;

  if (state.currentFilePath) {
    const parts = state.currentFilePath.split('/');
    fileInfo.textContent = parts.slice(-3).join('/');
  } else {
    fileInfo.textContent = 'No file selected';
  }
}

function setViewMode(mode: ViewMode): void {
  state.viewMode = mode;

  const editorPane = getElement('editor-pane');
  const previewPane = getElement('preview-pane');
  const mainContent = getElement('main-content');

  // Update button states
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`[data-view="${mode}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  mainContent.className = `main-content view-${mode}`;

  switch (mode) {
    case 'edit':
      editorPane.style.display = 'flex';
      previewPane.style.display = 'none';
      break;
    case 'preview':
      editorPane.style.display = 'none';
      previewPane.style.display = 'flex';
      break;
    case 'split':
      editorPane.style.display = 'flex';
      previewPane.style.display = 'flex';
      break;
  }
}

async function saveFile(): Promise<void> {
  if (!state.currentFilePath || state.isSaving) return;

  state.isSaving = true;
  updateStatusBar();

  try {
    const encodedPath = encodeURIComponent(state.currentFilePath);
    const res = await fetch(`/api/files/${encodedPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editor.getValue() }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Save failed');
    }

    state.isDirty = false;
  } catch (err) {
    console.error('Save error:', err);
    const statusText = getElement('status-text');
    statusText.textContent = 'Save failed!';
    statusText.className = 'status-error';
    return;
  } finally {
    state.isSaving = false;
  }

  updateStatusBar();
}

async function loadFile(filePath: string): Promise<void> {
  try {
    const encodedPath = encodeURIComponent(filePath);
    const res = await fetch(`/api/files/${encodedPath}`);
    if (!res.ok) throw new Error('Failed to load file');

    const data = await res.json();
    state.currentFilePath = filePath;
    state.isDirty = false;

    editor.setValue(data.content);
    updatePreview(data.content);
    updateStatusBar();

    sidebar.setSelectedPath(filePath);
  } catch (err) {
    console.error('Load error:', err);
  }
}

function initTheme(): void {
  // Detect system dark mode
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(dark: boolean): void {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  applyTheme(prefersDark.matches);
  prefersDark.addEventListener('change', (e) => applyTheme(e.matches));

  // Theme toggle button
  const themeBtn = getElement('theme-toggle');
  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
  });
}

function init(): void {
  initTheme();

  // Initialize editor
  editor = new Editor({
    container: getElement('editor-pane'),
    onChange: (content) => {
      state.isDirty = true;
      updatePreview(content);
      updateStatusBar();
    },
    onSave: saveFile,
  });

  // Initialize sidebar
  sidebar = new Sidebar({
    container: getElement('sidebar'),
    onFileSelect: (file) => loadFile(file.path),
  });

  // View mode buttons
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.view as ViewMode;
      if (mode) setViewMode(mode);
    });
  });

  // Global keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
  });

  // Set initial view mode
  setViewMode('split');

  // Load file tree
  sidebar.loadFiles();

  updateStatusBar();
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
