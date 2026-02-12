interface MemoryFile {
  path: string;
  projectName: string;
  projectPath: string;
  fileName: string;
  type: string;
  lastModified: string;
  size: number;
}

interface SearchMatch {
  line: number;
  text: string;
  highlight: [number, number];
}

interface SearchResult {
  file: MemoryFile;
  matches: SearchMatch[];
}

interface ProjectGroup {
  projectName: string;
  files: MemoryFile[];
}

export interface SidebarOptions {
  container: HTMLElement;
  onFileSelect: (file: MemoryFile) => void;
}

export class Sidebar {
  private container: HTMLElement;
  private searchInput: HTMLInputElement;
  private fileList: HTMLDivElement;
  private onFileSelect: (file: MemoryFile) => void;
  private files: MemoryFile[] = [];
  private selectedPath: string | null = null;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SidebarOptions) {
    this.container = options.container;
    this.onFileSelect = options.onFileSelect;

    // Search bar
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'search-wrapper';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'search-input';
    this.searchInput.placeholder = 'Search in files...';

    searchWrapper.appendChild(this.searchInput);
    this.container.appendChild(searchWrapper);

    // File list
    this.fileList = document.createElement('div');
    this.fileList.className = 'file-list';
    this.container.appendChild(this.fileList);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.searchInput.addEventListener('input', () => {
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.performSearch(this.searchInput.value);
      }, 300);
    });
  }

  async loadFiles(): Promise<void> {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      this.files = data.files;
      this.renderFileTree();
    } catch {
      this.fileList.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'error';
      errDiv.textContent = 'Failed to load files';
      this.fileList.appendChild(errDiv);
    }
  }

  private groupByProject(): ProjectGroup[] {
    const groups = new Map<string, MemoryFile[]>();
    for (const file of this.files) {
      const existing = groups.get(file.projectName) || [];
      existing.push(file);
      groups.set(file.projectName, existing);
    }
    return Array.from(groups.entries()).map(([projectName, files]) => ({
      projectName,
      files,
    }));
  }

  private renderFileTree(): void {
    this.fileList.textContent = '';
    const groups = this.groupByProject();

    if (groups.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent = 'No memory files found';
      this.fileList.appendChild(emptyDiv);
      return;
    }

    for (const group of groups) {
      const projectEl = document.createElement('div');
      projectEl.className = 'project-group';

      const header = document.createElement('div');
      header.className = 'project-header';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'project-icon';
      iconSpan.textContent = '\u{1F4C1}';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'project-name';
      nameSpan.textContent = group.projectName;
      header.appendChild(iconSpan);
      header.appendChild(document.createTextNode(' '));
      header.appendChild(nameSpan);
      header.addEventListener('click', () => {
        projectEl.classList.toggle('collapsed');
      });

      const filesEl = document.createElement('div');
      filesEl.className = 'project-files';

      for (const file of group.files) {
        const fileEl = document.createElement('div');
        fileEl.className = 'file-item';
        fileEl.dataset.path = file.path;
        if (file.path === this.selectedPath) {
          fileEl.classList.add('selected');
        }

        const fIconSpan = document.createElement('span');
        fIconSpan.className = 'file-icon';
        fIconSpan.textContent = '\u{1F4C4}';
        const fNameSpan = document.createElement('span');
        fNameSpan.className = 'file-name';
        fNameSpan.textContent = file.fileName;
        fileEl.appendChild(fIconSpan);
        fileEl.appendChild(document.createTextNode(' '));
        fileEl.appendChild(fNameSpan);

        fileEl.addEventListener('click', () => {
          this.selectedPath = file.path;
          this.onFileSelect(file);
          this.updateSelection();
        });

        filesEl.appendChild(fileEl);
      }

      projectEl.appendChild(header);
      projectEl.appendChild(filesEl);
      this.fileList.appendChild(projectEl);
    }
  }

  private updateSelection(): void {
    this.fileList.querySelectorAll('.file-item').forEach((item) => {
      const el = item as HTMLElement;
      el.classList.toggle('selected', el.dataset.path === this.selectedPath);
    });
  }

  private async performSearch(query: string): Promise<void> {
    if (query.length < 2) {
      this.renderFileTree();
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      this.renderSearchResults(data.results, query);
    } catch {
      this.fileList.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'error';
      errDiv.textContent = 'Search failed';
      this.fileList.appendChild(errDiv);
    }
  }

  private renderSearchResults(results: SearchResult[], query: string): void {
    this.fileList.textContent = '';

    if (results.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent = `No results for "${query}"`;
      this.fileList.appendChild(emptyDiv);
      return;
    }

    for (const result of results) {
      const resultEl = document.createElement('div');
      resultEl.className = 'search-result';

      const header = document.createElement('div');
      header.className = 'search-result-header';
      const fIcon = document.createElement('span');
      fIcon.className = 'file-icon';
      fIcon.textContent = '\u{1F4C4}';
      const pName = document.createElement('span');
      pName.className = 'project-name';
      pName.textContent = result.file.projectName;
      const fName = document.createElement('span');
      fName.className = 'file-name';
      fName.textContent = result.file.fileName;

      header.appendChild(fIcon);
      header.appendChild(document.createTextNode(' '));
      header.appendChild(pName);
      header.appendChild(document.createTextNode(' / '));
      header.appendChild(fName);

      header.addEventListener('click', () => {
        this.selectedPath = result.file.path;
        this.onFileSelect(result.file);
      });

      resultEl.appendChild(header);

      // Show first 3 matches using safe DOM methods
      const matchesToShow = result.matches.slice(0, 3);
      for (const match of matchesToShow) {
        const matchEl = document.createElement('div');
        matchEl.className = 'search-match';

        const lineSpan = document.createElement('span');
        lineSpan.className = 'match-line';
        lineSpan.textContent = `L${match.line}`;
        matchEl.appendChild(lineSpan);
        matchEl.appendChild(document.createTextNode(' '));

        const text = match.text;
        const [start, end] = match.highlight;

        // Before highlight
        if (start > 0) {
          matchEl.appendChild(document.createTextNode(text.substring(0, start)));
        }
        // Highlighted portion
        const markEl = document.createElement('mark');
        markEl.textContent = text.substring(start, end);
        matchEl.appendChild(markEl);
        // After highlight
        if (end < text.length) {
          matchEl.appendChild(document.createTextNode(text.substring(end)));
        }

        resultEl.appendChild(matchEl);
      }

      if (result.matches.length > 3) {
        const moreEl = document.createElement('div');
        moreEl.className = 'search-more';
        moreEl.textContent = `+${result.matches.length - 3} more matches`;
        resultEl.appendChild(moreEl);
      }

      this.fileList.appendChild(resultEl);
    }
  }

  setSelectedPath(path: string): void {
    this.selectedPath = path;
    this.updateSelection();
  }
}
