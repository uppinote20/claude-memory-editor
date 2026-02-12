export interface EditorOptions {
  container: HTMLElement;
  onChange: (content: string) => void;
  onSave: () => void;
}

export class Editor {
  private textarea: HTMLTextAreaElement;
  private lineNumbers: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private onChange: (content: string) => void;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private onSave: () => void;

  constructor(options: EditorOptions) {
    this.onChange = options.onChange;
    this.onSave = options.onSave;

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'editor-wrapper';

    this.lineNumbers = document.createElement('div');
    this.lineNumbers.className = 'line-numbers';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'editor-textarea';
    this.textarea.spellcheck = false;
    this.textarea.placeholder = 'Select a file from the sidebar to begin editing...';

    this.wrapper.appendChild(this.lineNumbers);
    this.wrapper.appendChild(this.textarea);
    options.container.appendChild(this.wrapper);

    this.setupEventListeners();
    this.updateLineNumbers();
  }

  private setupEventListeners(): void {
    this.textarea.addEventListener('input', () => {
      this.updateLineNumbers();
      this.onChange(this.textarea.value);
      this.scheduleAutoSave();
    });

    this.textarea.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.textarea.scrollTop;
    });

    this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ctrl/Cmd+S → save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.onSave();
        return;
      }

      // Tab → indent
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;

        if (e.shiftKey) {
          // Outdent: remove leading 2 spaces
          const before = this.textarea.value.substring(0, start);
          const lineStart = before.lastIndexOf('\n') + 1;
          const linePrefix = this.textarea.value.substring(lineStart, start);
          if (linePrefix.startsWith('  ')) {
            this.textarea.value = this.textarea.value.substring(0, lineStart) + this.textarea.value.substring(lineStart + 2);
            this.textarea.selectionStart = Math.max(lineStart, start - 2);
            this.textarea.selectionEnd = Math.max(lineStart, end - 2);
          }
        } else {
          // Indent: add 2 spaces
          this.textarea.value = this.textarea.value.substring(0, start) + '  ' + this.textarea.value.substring(end);
          this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        }

        this.updateLineNumbers();
        this.onChange(this.textarea.value);
        this.scheduleAutoSave();
      }
    });
  }

  private scheduleAutoSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.onSave();
    }, 2000);
  }

  private updateLineNumbers(): void {
    const lineCount = this.textarea.value.split('\n').length;
    this.lineNumbers.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  }

  getValue(): string {
    return this.textarea.value;
  }

  setValue(content: string): void {
    this.textarea.value = content;
    this.updateLineNumbers();
  }

  getLineCount(): number {
    return this.textarea.value.split('\n').length;
  }

  focus(): void {
    this.textarea.focus();
  }

  setReadOnly(readOnly: boolean): void {
    this.textarea.readOnly = readOnly;
  }
}
