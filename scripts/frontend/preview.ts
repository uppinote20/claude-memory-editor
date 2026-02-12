// Minimal markdown parser - no external dependencies
// Supports: headings, bold, italic, code blocks, inline code, lists, links, tables, blockquotes, horizontal rules

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeUrl(url: string): string {
  // Block javascript:, data:, vbscript: protocols
  const decoded = url.replace(/&#x?[0-9a-fA-F]+;/g, '').replace(/&amp;/g, '&');
  if (/^\s*(javascript|data|vbscript)\s*:/i.test(decoded)) {
    return '#blocked';
  }
  return url;
}

function parseInline(text: string): string {
  let result = escapeHtml(text);

  // Images: ![alt](url) - sanitize src URL
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    return `<img src="${sanitizeUrl(url)}" alt="${alt}" />`;
  });

  // Links: [text](url) - sanitize href URL
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    return `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener">${text}</a>`;
  });

  // Bold+italic: ***text*** or ___text___
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  result = result.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  return result;
}

interface TableRow {
  cells: string[];
  isHeader: boolean;
}

function parseTable(lines: string[], startIdx: number): { html: string; consumed: number } {
  const rows: TableRow[] = [];
  let i = startIdx;

  // Parse header row
  const headerLine = lines[i].trim();
  if (!headerLine.startsWith('|')) return { html: '', consumed: 0 };

  const headerCells = headerLine.split('|').slice(1, -1).map(c => c.trim());
  rows.push({ cells: headerCells, isHeader: true });
  i++;

  // Parse separator row
  if (i >= lines.length) return { html: '', consumed: 0 };
  const sepLine = lines[i].trim();
  if (!sepLine.match(/^\|[\s\-:|]+\|$/)) return { html: '', consumed: 0 };
  i++;

  // Parse body rows
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    rows.push({ cells, isHeader: false });
    i++;
  }

  let html = '<table>\n<thead>\n<tr>';
  for (const cell of rows[0].cells) {
    html += `<th>${parseInline(cell)}</th>`;
  }
  html += '</tr>\n</thead>\n<tbody>\n';

  for (let r = 1; r < rows.length; r++) {
    html += '<tr>';
    for (const cell of rows[r].cells) {
      html += `<td>${parseInline(cell)}</td>`;
    }
    html += '</tr>\n';
  }
  html += '</tbody>\n</table>';

  return { html, consumed: i - startIdx };
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let i = 0;
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLang = '';
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  function closeList() {
    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks: ```
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        output.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeContent.join('\n'))}</code></pre>`);
        codeContent = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      i++;
      continue;
    }

    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      closeList();
      i++;
      continue;
    }

    // Table detection
    if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().match(/^\|[\s\-:|]+\|$/)) {
      closeList();
      const table = parseTable(lines, i);
      if (table.consumed > 0) {
        output.push(table.html);
        i += table.consumed;
        continue;
      }
    }

    // Headings: # to ######
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/\s*#+\s*$/, ''); // Remove trailing #
      output.push(`<h${level}>${parseInline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (trimmed.match(/^[-*_]{3,}$/)) {
      closeList();
      output.push('<hr>');
      i++;
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith('> ') || trimmed === '>') {
      closeList();
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      output.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Unordered list: - item, * item, + item
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${parseInline(ulMatch[1])}</li>`);
      i++;
      continue;
    }

    // Ordered list: 1. item
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${parseInline(olMatch[1])}</li>`);
      i++;
      continue;
    }

    // Checkbox list: - [ ] or - [x]
    const checkMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (checkMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul class="checklist">');
        inList = true;
        listType = 'ul';
      }
      const checked = checkMatch[1] !== ' ' ? ' checked' : '';
      output.push(`<li><input type="checkbox"${checked} disabled> ${parseInline(checkMatch[2])}</li>`);
      i++;
      continue;
    }

    // Default: paragraph
    closeList();
    output.push(`<p>${parseInline(trimmed)}</p>`);
    i++;
  }

  // Close unclosed code block
  if (inCodeBlock) {
    output.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeContent.join('\n'))}</code></pre>`);
  }

  closeList();

  let html = output.join('\n');
  // Final safety: strip any script tags or event handlers that might have slipped through
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  return html;
}
