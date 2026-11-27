import {
  AstSymbolNode,
  CodeFile,
  DependencyEdge,
  FileImport,
  ParsedWorkspace,
  SupportedLanguage,
  SymbolKind,
} from '../types/context';

/**
 * Zero-dependency BPE-aligned token estimator mirroring tiktoken (cl100k_base heuristics).
 * Splits identifiers into subword chunks (~3.5-3.8 chars per token), handles CJK characters,
 * punctuation, and whitespace efficiently with zero external library dependencies.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  const chunks = text.match(/[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[^\sA-Za-z0-9_]|\s+/g);
  if (!chunks) return Math.ceil(text.length / 4);

  for (const chunk of chunks) {
    if (/^\s+$/.test(chunk)) {
      tokens += chunk.includes('\n') ? 0.5 : 0.15;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(chunk)) {
      if (chunk.length <= 4) {
        tokens += 1;
      } else {
        tokens += Math.ceil(chunk.length / 3.8);
      }
    } else if (/^[0-9]+$/.test(chunk)) {
      tokens += Math.max(1, Math.ceil(chunk.length / 4));
    } else {
      const codePoint = chunk.charCodeAt(0);
      if (codePoint >= 128) {
        tokens += 1.0; // CJK / unicode
      } else {
        tokens += 0.75; // punctuation
      }
    }
  }
  return Math.max(1, Math.round(tokens));
}

export function detectLanguage(filePath: string): SupportedLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return 'typescript';
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return 'javascript';
  }
  if (lower.endsWith('.py') || lower.endsWith('.pyw')) return 'python';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (
    lower.endsWith('.cpp') ||
    lower.endsWith('.cc') ||
    lower.endsWith('.cxx') ||
    lower.endsWith('.hpp') ||
    lower.endsWith('.hh') ||
    lower.endsWith('.hxx') ||
    lower.endsWith('.inl') ||
    lower.endsWith('.ipp') ||
    lower.endsWith('.tcc')
  ) {
    return 'cpp';
  }
  if (lower.endsWith('.swift')) return 'swift';
  if (lower.endsWith('.php') || lower.endsWith('.phtml')) return 'php';
  if (
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    lower.endsWith('.vue') ||
    lower.endsWith('.svelte') ||
    lower.endsWith('.xml')
  ) {
    return 'html';
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) return 'css';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.java') || lower.endsWith('.kt') || lower.endsWith('.kts')) return 'java';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.sql')) return 'sql';
  return 'other';
}

const STOP_IDENTIFIERS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch',
  'case', 'break', 'continue', 'default', 'try', 'catch', 'finally', 'throw', 'new',
  'await', 'async', 'import', 'export', 'from', 'as', 'type', 'interface', 'class',
  'extends', 'implements', 'public', 'private', 'protected', 'readonly', 'static',
  'true', 'false', 'null', 'undefined', 'void', 'string', 'number', 'boolean',
  'any', 'unknown', 'never', 'object', 'Promise', 'Array', 'Record', 'Partial',
  'Pick', 'Omit', 'Map', 'Set', 'Error', 'Math', 'Date', 'JSON', 'Object', 'console',
  'this', 'super', 'self', 'def', 'None', 'True', 'False', 'func', 'struct', 'package',
  'enum', 'trait', 'impl', 'pub', 'fn', 'mut', 'protocol', 'extension', 'actor',
  'include', 'require', 'require_once', 'include_once', 'namespace', 'using', 'sizeof',
  'int', 'char', 'float', 'double', 'long', 'short', 'unsigned', 'signed', 'bool',
  'div', 'span', 'section', 'header', 'footer', 'main', 'nav', 'html', 'head', 'body',
  'script', 'style', 'template', 'select', 'where', 'create', 'table', 'end',
]);

function extractIdentifiers(code: string, ownName: string): string[] {
  // Strip comments and strings before scanning identifier references
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, ' ');

  const ids = new Set<string>();
  const matches = stripped.match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g);
  if (!matches) return [];
  for (const id of matches) {
    if (!STOP_IDENTIFIERS.has(id) && id !== ownName) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Robust Tree-sitter style structural brace matcher.
 * Correctly handles regex literals (distinguishing division from regex),
 * template literals with nested ${...}, block/line comments, strings,
 * multi-line generics/angle brackets, and decorators.
 */
function findMatchingBrace(source: string, openBraceIdx: number): number {
  let depth = 0;
  let angleDepth = 0;
  const len = source.length;
  let i = openBraceIdx;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    // Line comment
    if (ch === '/' && next === '/') {
      const nl = source.indexOf('\n', i + 2);
      i = nl === -1 ? len : nl + 1;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    // Regex literal check: if '/' and not division
    if (ch === '/' && next !== '/' && next !== '*') {
      const prevTrimmed = source.slice(0, i).trimEnd();
      const lastWord = prevTrimmed.split(/[\s+\-*/%=<>!&|,;:({[\]}]+/).pop() || '';
      const isLikelyRegex =
        lastWord === 'return' ||
        lastWord === 'typeof' ||
        lastWord === 'instanceof' ||
        lastWord === 'yield' ||
        lastWord === 'case' ||
        lastWord === 'throw' ||
        ['=', '(', '[', '{', ',', ':', ';', '?', '!', '&', '|', '+', '-', '*', '%'].includes(prevTrimmed.slice(-1));

      if (isLikelyRegex) {
        i++; // skip opening '/'
        while (i < len) {
          if (source[i] === '\\') {
            i += 2;
            continue;
          }
          if (source[i] === '[') {
            i++;
            while (i < len) {
              if (source[i] === '\\') { i += 2; continue; }
              if (source[i] === ']') { i++; break; }
              i++;
            }
            continue;
          }
          if (source[i] === '/') {
            i++;
            while (i < len && /[dgimsuy]/.test(source[i])) {
              i++;
            }
            break;
          }
          i++;
        }
        continue;
      }
    }

    // Single / Double quotes
    if (ch === '"' || ch === "'") {
      const quoteChar = ch;
      i++;
      while (i < len) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quoteChar) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Template literal (handles nested ${ ... } expressions)
    if (ch === '`') {
      i++;
      let tplBraceDepth = 0;
      while (i < len) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          tplBraceDepth++;
          i += 2;
          continue;
        }
        if (tplBraceDepth > 0) {
          if (source[i] === '{') tplBraceDepth++;
          else if (source[i] === '}') tplBraceDepth--;
          i++;
          continue;
        }
        if (source[i] === '`') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '<' && depth === 0) {
      angleDepth++;
    } else if (ch === '>' && depth === 0 && angleDepth > 0) {
      angleDepth--;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return len - 1;
}

function getLineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function extractLeadingDoc(lines: string[], startLineOneBased: number): { doc: string; docStartLine: number } {
  let idx = startLineOneBased - 2; // 0-based line above declaration
  while (idx >= 0 && lines[idx].trim() === '') {
    // Only tolerate 0 blank lines between doc and declaration
    break;
  }
  if (idx < 0) return { doc: '', docStartLine: startLineOneBased };

  const collected: string[] = [];
  if (lines[idx].trim().endsWith('*/')) {
    while (idx >= 0) {
      collected.unshift(lines[idx]);
      if (lines[idx].trim().startsWith('/*')) {
        return { doc: collected.join('\n'), docStartLine: idx + 1 };
      }
      idx--;
    }
  } else if (lines[idx].trim().startsWith('//') || lines[idx].trim().startsWith('#')) {
    while (idx >= 0 && (lines[idx].trim().startsWith('//') || lines[idx].trim().startsWith('#'))) {
      collected.unshift(lines[idx]);
      idx--;
    }
    return { doc: collected.join('\n'), docStartLine: idx + 2 };
  }
  return { doc: '', docStartLine: startLineOneBased };
}

function parseTsJsImports(content: string): FileImport[] {
  const results: FileImport[] = [];
  const importRegex = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const clause = match[1];
    const spec = match[2];
    const names: string[] = [];
    const braceMatch = clause.match(/\{([\s\S]*?)\}/);
    if (braceMatch) {
      for (const part of braceMatch[1].split(',')) {
        const cleaned = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (cleaned) names.push(cleaned);
      }
    }
    const defaultPart = clause.replace(/\{[\s\S]*?\}/, '').replace(',', '').trim();
    if (defaultPart && !defaultPart.startsWith('*')) {
      names.push(defaultPart);
    }
    results.push({ rawSpecifier: spec, resolvedFileId: null, importedNames: names });
  }
  return results;
}

function buildTsJsClassSkeleton(
  fullClassCode: string,
  headerLine: string,
  doc: string,
): string {
  const openIdx = fullClassCode.indexOf('{');
  if (openIdx === -1) return fullClassCode;
  const body = fullClassCode.slice(openIdx + 1, fullClassCode.lastIndexOf('}'));
  const lines = body.split('\n');
  const sigLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    // Field or property signature without method block
    if (
      /^(?:public|private|protected|readonly|static|\s)*[A-Za-z_$][A-Za-z0-9_$]*\s*[?!]?\s*:\s*[^=]+;/.test(trimmed) &&
      !trimmed.includes('{')
    ) {
      sigLines.push(`  ${trimmed}`);
      i++;
      continue;
    }
    // Method declaration
    const methodMatch = trimmed.match(
      /^(?:(public|private|protected|async|static)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*(<[^>]*>)?\s*\(/,
    );
    if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[2])) {
      // Collect signature up to '{'
      let sigBuffer = line;
      let j = i;
      while (j < lines.length && !sigBuffer.includes('{')) {
        j++;
        if (j < lines.length) sigBuffer += '\n' + lines[j];
      }
      const bracePosInBody = body.indexOf('{', body.split('\n').slice(0, i).join('\n').length);
      if (bracePosInBody !== -1) {
        const endPos = findMatchingBrace(body, bracePosInBody);
        const startLineInClass = getLineNumberAt(body, bracePosInBody);
        const endLineInClass = getLineNumberAt(body, endPos);
        const foldedCount = Math.max(1, endLineInClass - startLineInClass - 1);
        const sigOnly = sigBuffer.slice(0, sigBuffer.indexOf('{')).trim();
        sigLines.push(`  ${sigOnly} { /* ... ${foldedCount} lines folded */ }`);
        i = endLineInClass;
        continue;
      }
    }
    i++;
  }

  const prefix = doc ? `${doc}\n` : '';
  return `${prefix}${headerLine} {\n${sigLines.join('\n')}\n}`;
}

function parseTsJsSymbols(file: CodeFile): AstSymbolNode[] {
  const { content, id: fileId, path: filePath } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const coveredRanges: Array<[number, number]> = [];

  const isCovered = (lineNum: number) =>
    coveredRanges.some(([s, e]) => lineNum >= s && lineNum <= e);

  // Match top-level declarations (with optional export/async/declare)
  const declRegex =
    /^(export\s+(?:default\s+)?)?(?:declare\s+)?(async\s+)?(function|class|interface|type|enum|const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

  let match: RegExpExecArray | null;
  while ((match = declRegex.exec(content)) !== null) {
    const matchStart = match.index;
    const declLine = getLineNumberAt(content, matchStart);
    if (isCovered(declLine)) continue;

    // Ensure it's genuinely top-level (indent <= 2 spaces)
    const lineText = lines[declLine - 1] ?? '';
    if (/^\s{2,}/.test(lineText) && !lineText.trimStart().startsWith('export')) continue;

    const exported = Boolean(match[1]);
    const keyword = match[3];
    const name = match[4];

    // Look ahead from matchStart for '{' or '=' or ';'
    let kind: SymbolKind = 'const';
    if (keyword === 'function') kind = 'function';
    else if (keyword === 'class') kind = 'class';
    else if (keyword === 'interface') kind = 'interface';
    else if (keyword === 'type' || keyword === 'enum') kind = 'type';

    let endLine = declLine;
    const searchSlice = content.slice(matchStart);
    const firstBraceRel = searchSlice.indexOf('{');
    const firstSemiRel = searchSlice.indexOf(';');
    const firstNewlineRel = searchSlice.indexOf('\n');

    let hasBlock = false;
    let blockOpenAbs = -1;

    if (keyword === 'type') {
      // Type alias might be single line or multi-line object type
      const eqRel = searchSlice.indexOf('=');
      const afterEq = eqRel !== -1 ? searchSlice.slice(eqRel + 1).trimStart() : '';
      if (afterEq.startsWith('{') && firstBraceRel !== -1) {
        hasBlock = true;
        blockOpenAbs = matchStart + firstBraceRel;
      } else {
        // Find terminating semicolon or newline
        const semi = searchSlice.indexOf(';');
        const endRel = semi !== -1 ? semi : firstNewlineRel !== -1 ? firstNewlineRel : searchSlice.length - 1;
        endLine = getLineNumberAt(content, matchStart + endRel);
      }
    } else if (keyword === 'const' || keyword === 'let') {
      // Check if arrow function or object with brace before semicolon
      const eqIdx = searchSlice.indexOf('=');
      const arrowIdx = searchSlice.indexOf('=>');
      if (arrowIdx !== -1 && (firstSemiRel === -1 || arrowIdx < firstSemiRel + 80)) {
        kind = 'function';
      }
      if (firstBraceRel !== -1 && (firstSemiRel === -1 || firstBraceRel < firstSemiRel)) {
        hasBlock = true;
        blockOpenAbs = matchStart + firstBraceRel;
      } else if (firstSemiRel !== -1) {
        endLine = getLineNumberAt(content, matchStart + firstSemiRel);
      }
    } else if (firstBraceRel !== -1) {
      hasBlock = true;
      blockOpenAbs = matchStart + firstBraceRel;
    }

    if (hasBlock && blockOpenAbs !== -1) {
      const closeAbs = findMatchingBrace(content, blockOpenAbs);
      endLine = getLineNumberAt(content, closeAbs);
      // Include trailing semicolon if on same line
      if (content[closeAbs + 1] === ';') {
        endLine = getLineNumberAt(content, closeAbs + 1);
      }
    }

    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);
    const actualStartLine = docStartLine;
    coveredRanges.push([actualStartLine, endLine]);

    const fullCode = lines.slice(actualStartLine - 1, endLine).join('\n');
    const lineCount = endLine - actualStartLine + 1;
    const refs = extractIdentifiers(fullCode, name);

    let skeletonCode = fullCode;
    if (kind === 'interface' || kind === 'type') {
      // Keep types/interfaces intact for zero-hallucination type safety!
      skeletonCode = fullCode;
    } else if (kind === 'class') {
      const headerLine = content.slice(matchStart, blockOpenAbs).trim();
      skeletonCode = buildTsJsClassSkeleton(fullCode, headerLine, doc);
    } else if (hasBlock && lineCount > 4) {
      const headerOnly = content.slice(matchStart, blockOpenAbs).trim();
      const foldedLines = Math.max(1, lineCount - 2);
      const topRefs = refs.slice(0, 4).join(', ');
      const refNote = topRefs ? ` | calls: ${topRefs}` : '';
      const prefix = doc ? `${doc}\n` : '';
      skeletonCode = `${prefix}${headerOnly} { /* ... ${foldedLines} lines folded${refNote} */ }`;
    }

    const nodeId = `${fileId}::${name}@${actualStartLine}`;
    nodes.push({
      id: nodeId,
      fileId,
      filePath,
      name,
      qualifiedName: `${filePath.split('/').pop()} › ${name}`,
      kind,
      exported,
      startLine: actualStartLine,
      endLine,
      lineCount,
      fullCode,
      skeletonCode,
      rawTokens: estimateTokens(fullCode),
      skeletonTokens: estimateTokens(skeletonCode),
      mapTokens: estimateTokens(`${filePath}:${actualStartLine} ${kind} ${name}`),
      docComment: doc,
      referencedIdentifiers: refs,
    });

    // If this is a large class (> 35 lines), also extract its methods for fine-grained intra-class slicing!
    if (kind === 'class' && lineCount > 35 && blockOpenAbs !== -1) {
      const classBodyStartLine = getLineNumberAt(content, blockOpenAbs) + 1;
      for (let ln = classBodyStartLine; ln < endLine; ln++) {
        const rawLine = lines[ln - 1] ?? '';
        const methodMatch = rawLine.match(
          /^\s{2,4}(?:(?:public|private|protected|async|static)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)/,
        );
        if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(methodMatch[1])) {
          const mName = methodMatch[1];
          const lineOffsetAbs = lines.slice(0, ln - 1).join('\n').length + (ln > 1 ? 1 : 0);
          const mBraceRel = content.slice(lineOffsetAbs).indexOf('{');
          if (mBraceRel !== -1) {
            const mBraceAbs = lineOffsetAbs + mBraceRel;
            const mEndAbs = findMatchingBrace(content, mBraceAbs);
            const mEndLine = getLineNumberAt(content, mEndAbs);
            if (mEndLine < endLine && mEndLine - ln >= 4) {
              const mDoc = extractLeadingDoc(lines, ln);
              const mFull = lines.slice(mDoc.docStartLine - 1, mEndLine).join('\n');
              const mHeader = content.slice(lineOffsetAbs, mBraceAbs).trim();
              const mRefs = extractIdentifiers(mFull, mName);
              const mFolded = Math.max(1, mEndLine - ln - 1);
              const mSkel = `${mDoc.doc ? mDoc.doc + '\n' : ''}${mHeader} { /* ... ${mFolded} lines folded */ }`;
              nodes.push({
                id: `${fileId}::${name}.${mName}@${mDoc.docStartLine}`,
                fileId,
                filePath,
                name: `${name}.${mName}`,
                qualifiedName: `${name}.${mName}`,
                kind: 'method',
                exported,
                startLine: mDoc.docStartLine,
                endLine: mEndLine,
                lineCount: mEndLine - mDoc.docStartLine + 1,
                fullCode: mFull,
                skeletonCode: mSkel,
                rawTokens: estimateTokens(mFull),
                skeletonTokens: estimateTokens(mSkel),
                mapTokens: estimateTokens(`${filePath}:${mDoc.docStartLine} method ${name}.${mName}`),
                docComment: mDoc.doc,
                referencedIdentifiers: mRefs,
              });
              ln = mEndLine;
            }
          }
        }
      }
    }
  }

  return nodes;
}

function parsePythonSymbols(file: CodeFile): AstSymbolNode[] {
  const { content, id: fileId, path: filePath } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?.*:/);
    if (!match) continue;
    const kind: SymbolKind = match[1] === 'class' ? 'class' : 'function';
    const name = match[2];
    const startLine = i + 1;

    let endLine = startLine;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.trim() === '' || /^\s+/.test(next)) {
        endLine = j + 1;
      } else {
        break;
      }
    }
    while (endLine > startLine && lines[endLine - 1].trim() === '') {
      endLine--;
    }

    const fullCode = lines.slice(startLine - 1, endLine).join('\n');
    const lineCount = endLine - startLine + 1;
    const refs = extractIdentifiers(fullCode, name);
    const skeletonCode =
      lineCount > 3
        ? `${line}\n    # ... ${lineCount - 1} lines folded`
        : fullCode;

    nodes.push({
      id: `${fileId}::${name}@${startLine}`,
      fileId,
      filePath,
      name,
      qualifiedName: `${filePath.split('/').pop()} › ${name}`,
      kind,
      exported: !name.startsWith('_'),
      startLine,
      endLine,
      lineCount,
      fullCode,
      skeletonCode,
      rawTokens: estimateTokens(fullCode),
      skeletonTokens: estimateTokens(skeletonCode),
      mapTokens: estimateTokens(`${filePath}:${startLine} ${kind} ${name}`),
      docComment: '',
      referencedIdentifiers: refs,
    });
    i = endLine - 1;
  }

  return nodes;
}

function parseGoImports(content: string, allFiles: CodeFile[]): FileImport[] {
  const results: FileImport[] = [];
  const specs: string[] = [];

  const singleRe = /^import\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+)?"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = singleRe.exec(content)) !== null) {
    specs.push(m[1]);
  }

  const blockRe = /import\s*\(([\s\S]*?)\)/g;
  while ((m = blockRe.exec(content)) !== null) {
    const inner = m[1];
    const lineRe = /(?:[A-Za-z_][A-Za-z0-9_]*\s+)?"([^"]+)"/g;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(inner)) !== null) {
      specs.push(lm[1]);
    }
  }

  for (const spec of specs) {
    const pkgTail = spec.split('/').slice(-2).join('/');
    const shortPkg = spec.split('/').pop() ?? spec;
    const matched = allFiles.find((f) => {
      if (!f.path.endsWith('.go')) return false;
      const dir = f.path.split('/').slice(0, -1).join('/');
      return dir === spec || dir.endsWith(`/${pkgTail}`) || dir.endsWith(`/${shortPkg}`) || dir === shortPkg;
    });
    results.push({
      rawSpecifier: spec,
      resolvedFileId: matched ? matched.id : null,
      importedNames: [shortPkg],
    });
  }
  return results;
}

function parseGoSymbols(file: CodeFile): AstSymbolNode[] {
  const { content, id: fileId, path: filePath } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];

  // Match Go functions, receiver methods, and type struct/interface definitions
  const goDeclRe = /^(func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(|type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)\b)/gm;

  let match: RegExpExecArray | null;
  while ((match = goDeclRe.exec(content)) !== null) {
    const matchStart = match.index;
    const declLine = getLineNumberAt(content, matchStart);
    const isFunc = match[0].startsWith('func');
    let name = isFunc ? match[2] : match[3];
    let kind: SymbolKind = isFunc ? 'function' : match[4] === 'interface' ? 'interface' : 'type';

    if (isFunc) {
      const recvMatch = match[0].match(/^func\s+\(\s*[A-Za-z_][A-Za-z0-9_]*\s+\*?([A-Za-z_][A-Za-z0-9_]*)\s*\)/);
      if (recvMatch) {
        name = `${recvMatch[1]}.${name}`;
        kind = 'method';
      }
    }

    const searchSlice = content.slice(matchStart);
    const firstBraceRel = searchSlice.indexOf('{');
    let endLine = declLine;
    let blockOpenAbs = -1;
    if (firstBraceRel !== -1) {
      blockOpenAbs = matchStart + firstBraceRel;
      const closeAbs = findMatchingBrace(content, blockOpenAbs);
      endLine = getLineNumberAt(content, closeAbs);
    }

    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);
    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const lineCount = endLine - docStartLine + 1;
    const shortName = name.includes('.') ? name.split('.').pop()! : name;
    const refs = extractIdentifiers(fullCode, shortName);

    let skeletonCode = fullCode;
    if (kind === 'function' || kind === 'method') {
      if (blockOpenAbs !== -1 && lineCount > 4) {
        const sigHeader = content.slice(matchStart, blockOpenAbs).trim();
        const folded = Math.max(1, lineCount - 2);
        const topRefs = refs.slice(0, 4).join(', ');
        const refNote = topRefs ? ` | calls: ${topRefs}` : '';
        skeletonCode = `${doc ? doc + '\n' : ''}${sigHeader} { /* ... ${folded} lines folded${refNote} */ }`;
      }
    }

    nodes.push({
      id: `${fileId}::${name}@${docStartLine}`,
      fileId,
      filePath,
      name,
      qualifiedName: `${filePath.split('/').pop()} › ${name}`,
      kind,
      exported: /^[A-Z]/.test(shortName),
      startLine: docStartLine,
      endLine,
      lineCount,
      fullCode,
      skeletonCode,
      rawTokens: estimateTokens(fullCode),
      skeletonTokens: estimateTokens(skeletonCode),
      mapTokens: estimateTokens(`${filePath}:${docStartLine} ${kind} ${name}`),
      docComment: doc,
      referencedIdentifiers: refs,
    });
  }

  return nodes;
}

function parsePythonImports(content: string, allFiles: CodeFile[]): FileImport[] {
  const results: FileImport[] = [];
  const fromRe = /^from\s+\.*([A-Za-z0-9_.]+)\s+import\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(content)) !== null) {
    const modPath = m[1].replace(/\./g, '/');
    const names = m[2]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const matched = allFiles.find(
      (f) =>
        f.language === 'python' &&
        (f.path.endsWith(`${modPath}.py`) || f.path.endsWith(`${modPath}/__init__.py`)),
    );
    results.push({ rawSpecifier: m[1], resolvedFileId: matched?.id ?? null, importedNames: names });
  }

  const impRe = /^import\s+([A-Za-z0-9_.]+)/gm;
  while ((m = impRe.exec(content)) !== null) {
    const modPath = m[1].replace(/\./g, '/');
    const shortName = m[1].split('.').pop() ?? m[1];
    const matched = allFiles.find(
      (f) => f.language === 'python' && f.path.endsWith(`${modPath}.py`),
    );
    results.push({
      rawSpecifier: m[1],
      resolvedFileId: matched?.id ?? null,
      importedNames: [shortName],
    });
  }
  return results;
}

function makeAstNode(params: {
  file: CodeFile;
  name: string;
  qualifiedName?: string;
  kind: SymbolKind;
  exported: boolean;
  startLine: number;
  endLine: number;
  fullCode: string;
  skeletonCode: string;
  docComment: string;
  shortName?: string;
}): AstSymbolNode {
  const {
    file,
    name,
    qualifiedName,
    kind,
    exported,
    startLine,
    endLine,
    fullCode,
    skeletonCode,
    docComment,
    shortName,
  } = params;
  return {
    id: `${file.id}::${name}@${startLine}`,
    fileId: file.id,
    filePath: file.path,
    name,
    qualifiedName: qualifiedName ?? `${file.path.split('/').pop()} › ${name}`,
    kind,
    exported,
    startLine,
    endLine,
    lineCount: Math.max(1, endLine - startLine + 1),
    fullCode,
    skeletonCode,
    rawTokens: estimateTokens(fullCode),
    skeletonTokens: estimateTokens(skeletonCode),
    mapTokens: estimateTokens(`${file.path}:${startLine} ${kind} ${name}`),
    docComment,
    referencedIdentifiers: extractIdentifiers(fullCode, shortName ?? name),
  };
}

function parseCIncludes(filePath: string, content: string, allFiles: CodeFile[]): FileImport[] {
  const results: FileImport[] = [];
  const re = /^\s*#include\s+"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const spec = m[1];
    const resolvedId =
      resolveImportPath(filePath, spec.startsWith('.') ? spec : `./${spec}`, allFiles) ??
      allFiles.find((f) => f.path.endsWith(`/${spec}`) || f.path === spec)?.id ??
      null;
    results.push({
      rawSpecifier: spec,
      resolvedFileId: resolvedId,
      importedNames: [spec.split('/').pop() ?? spec],
    });
  }
  return results;
}

const CONTROL_FLOW_WORDS = new Set([
  'if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'typeof', 'do', 'try',
]);

function parseCCppSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const covered: Array<[number, number]> = [];
  const isCovered = (ln: number) => covered.some(([s, e]) => ln >= s && ln <= e);

  // 1. Struct / Class / Enum / Namespace
  const typeRe = /^(?:typedef\s+)?(struct|class|enum(?:\s+class)?|namespace)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    if (isCovered(declLine)) continue;
    const openRel = content.slice(startIdx).indexOf('{');
    const semiRel = content.slice(startIdx).indexOf(';');
    if (openRel === -1 || (semiRel !== -1 && semiRel < openRel)) continue;

    const openAbs = startIdx + openRel;
    const closeAbs = findMatchingBrace(content, openAbs);
    let endLine = getLineNumberAt(content, closeAbs);
    if (content[closeAbs + 1] === ';') endLine = getLineNumberAt(content, closeAbs + 1);

    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);
    covered.push([docStartLine, endLine]);
    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const kind: SymbolKind = m[1].startsWith('class') ? 'class' : 'type';
    const header = content.slice(startIdx, openAbs).trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      endLine - docStartLine + 1 > 6
        ? `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ };`
        : fullCode;

    nodes.push(
      makeAstNode({
        file,
        name: m[2],
        kind,
        exported: true,
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
      }),
    );
  }

  // 2. Top-level / Class::Method function definitions
  const fnRe = /^([A-Za-z_~][A-Za-z0-9_:<>*& \t]*?)[ \t]+([A-Za-z_~][A-Za-z0-9_:]*(?:::[A-Za-z_~][A-Za-z0-9_]*)?)[ \t]*\([^;{}]*\)[ \t]*(?:const[ \t]*)?(?:noexcept[ \t]*)?(?:override[ \t]*)?\{/gm;
  while ((m = fnRe.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    if (isCovered(declLine)) continue;
    const name = m[2];
    const shortName = name.includes('::') ? name.split('::').pop()! : name;
    if (CONTROL_FLOW_WORDS.has(shortName)) continue;

    const openAbs = startIdx + m[0].lastIndexOf('{');
    const closeAbs = findMatchingBrace(content, openAbs);
    const endLine = getLineNumberAt(content, closeAbs);
    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);
    covered.push([docStartLine, endLine]);

    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const header = content.slice(startIdx, openAbs).trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      endLine - docStartLine + 1 > 4
        ? `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ }`
        : fullCode;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind: name.includes('::') ? 'method' : 'function',
        exported: !m[1].includes('static'),
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
        shortName,
      }),
    );
  }

  return nodes;
}

function parseSwiftSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  let currentType = '';
  let currentTypeEnd = 0;

  const swiftRe =
    /^([ \t]*)(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?[ \t]+)*(?:(?:public|private|internal|open|fileprivate|final|static|class|override|mutating|nonmutating|async|throws)[ \t]+)*(func|class|struct|enum|protocol|extension|actor)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = swiftRe.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    const indent = m[1].length;
    if (indent > 6) continue; // skip deeply nested closures

    if (declLine > currentTypeEnd) currentType = '';

    const openRel = content.slice(startIdx).indexOf('{');
    if (openRel === -1) continue;
    const openAbs = startIdx + openRel;
    const closeAbs = findMatchingBrace(content, openAbs);
    const endLine = getLineNumberAt(content, closeAbs);
    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);

    const kw = m[2];
    const rawName = m[3];
    let kind: SymbolKind = 'type';
    let name = rawName;
    if (kw === 'func') {
      if (indent > 0 && currentType && declLine <= currentTypeEnd) {
        kind = 'method';
        name = `${currentType}.${rawName}`;
      } else {
        kind = 'function';
      }
    } else if (kw === 'class' || kw === 'actor' || kw === 'extension' || kw === 'struct') {
      kind = kw === 'struct' ? 'type' : 'class';
      currentType = rawName;
      currentTypeEnd = endLine;
    } else if (kw === 'protocol') {
      kind = 'interface';
      currentType = rawName;
      currentTypeEnd = endLine;
    }

    const lineText = lines[declLine - 1] ?? '';
    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const header = content.slice(startIdx, openAbs).trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      kind === 'interface' || endLine - docStartLine + 1 <= 4
        ? fullCode
        : `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ }`;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: !lineText.includes('private ') && !lineText.includes('fileprivate '),
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
        shortName: rawName,
      }),
    );
  }
  return nodes;
}

function parsePhpImports(filePath: string, content: string, allFiles: CodeFile[]): FileImport[] {
  const results: FileImport[] = [];
  const reqRe = /(?:require|require_once|include|include_once)\s*(?:\(\s*)?['"]([^'"]+\.php)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = reqRe.exec(content)) !== null) {
    const spec = m[1];
    const resolved =
      resolveImportPath(filePath, spec.startsWith('.') ? spec : `./${spec}`, allFiles) ??
      allFiles.find((f) => f.path.endsWith(`/${spec}`) || f.path === spec)?.id ??
      null;
    results.push({
      rawSpecifier: spec,
      resolvedFileId: resolved,
      importedNames: [spec.split('/').pop() ?? spec],
    });
  }
  const useRe = /^\s*use\s+([A-Za-z0-9_\\]+);/gm;
  while ((m = useRe.exec(content)) !== null) {
    const ns = m[1];
    const cls = ns.split('\\').pop() ?? ns;
    const matched = allFiles.find((f) => f.language === 'php' && f.path.endsWith(`${cls}.php`));
    results.push({
      rawSpecifier: ns,
      resolvedFileId: matched?.id ?? null,
      importedNames: [cls],
    });
  }
  return results;
}

function parsePhpSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const phpRe =
    /^([ \t]*)(?:(?:abstract|final|public|protected|private|static)\s+)*(function|class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let currentClass = '';
  let currentClassEnd = 0;

  let m: RegExpExecArray | null;
  while ((m = phpRe.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    const indent = m[1].length;
    const kw = m[2];
    const rawName = m[3];

    if (declLine > currentClassEnd) currentClass = '';

    const openRel = content.slice(startIdx).indexOf('{');
    const semiRel = content.slice(startIdx).indexOf(';');
    if (openRel === -1 || (semiRel !== -1 && semiRel < openRel)) continue;

    const openAbs = startIdx + openRel;
    const closeAbs = findMatchingBrace(content, openAbs);
    const endLine = getLineNumberAt(content, closeAbs);
    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);

    let kind: SymbolKind = 'function';
    let displayName = rawName;
    if (kw === 'class' || kw === 'trait') {
      kind = 'class';
      currentClass = rawName;
      currentClassEnd = endLine;
    } else if (kw === 'interface') {
      kind = 'interface';
      currentClass = rawName;
      currentClassEnd = endLine;
    } else if (kw === 'enum') {
      kind = 'type';
    } else if (kw === 'function' && indent > 0 && currentClass && declLine <= currentClassEnd) {
      kind = 'method';
      displayName = `${currentClass}.${rawName}`;
    }

    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const header = content.slice(startIdx, openAbs).trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      kind === 'interface' || endLine - docStartLine + 1 <= 4
        ? fullCode
        : `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ }`;

    nodes.push(
      makeAstNode({
        file,
        name: displayName,
        kind,
        exported: !header.includes('private '),
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
        shortName: rawName,
      }),
    );
  }
  return nodes;
}

function parseHtmlImports(filePath: string, content: string, allFiles: CodeFile[]): FileImport[] {
  const results: FileImport[] = [];
  const attrRe = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(content)) !== null) {
    const spec = m[1].split('?')[0];
    if (/^https?:\/\//i.test(spec)) continue;
    const resolved =
      resolveImportPath(filePath, spec.startsWith('.') ? spec : `./${spec}`, allFiles) ??
      allFiles.find((f) => f.path.endsWith(`/${spec.replace(/^\/+/, '')}`) || f.path === spec.replace(/^\/+/, ''))?.id ??
      null;
    results.push({
      rawSpecifier: spec,
      resolvedFileId: resolved,
      importedNames: [spec.split('/').pop() ?? spec],
    });
  }
  return results;
}

function findHtmlClosingTagLine(lines: string[], startLineIdx: number, tag: string): number {
  const openTagRe = new RegExp(`<${tag}(?:\\s|>)`, 'gi');
  const closeTagRe = new RegExp(`</${tag}>`, 'gi');
  let depth = 0;
  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    const opens = line.match(openTagRe)?.length ?? 0;
    const closes = line.match(closeTagRe)?.length ?? 0;
    depth += opens - closes;
    if (depth <= 0 && i >= startLineIdx) {
      return i + 1;
    }
  }
  return lines.length;
}

function parseHtmlSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const covered: Array<[number, number]> = [];
  const isCovered = (ln: number) => covered.some(([s, e]) => ln >= s && ln <= e);

  const tagRe = /^([ \t]*)<(head|header|nav|main|section|article|form|template|footer|script|style|div)(?:\s+([^>]*))?>/i;

  for (let i = 0; i < lines.length; i++) {
    const startLine = i + 1;
    if (isCovered(startLine)) continue;
    const m = lines[i].match(tagRe);
    if (!m) continue;

    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const classMatch = attrs.match(/\bclass=["']([^"'\s]+)/i);
    // Only extract <div> if it has an explicit id so we don't noise-split layout wrappers
    if (tag === 'div' && !idMatch) continue;
    if (tag === 'script' && /\bsrc=/.test(attrs)) continue;

    const endLine = findHtmlClosingTagLine(lines, i, tag);
    const lineCount = endLine - startLine + 1;
    if (lineCount < 2) continue;

    covered.push([startLine, endLine]);
    const labelSuffix = idMatch ? `#${idMatch[1]}` : classMatch ? `.${classMatch[1]}` : '';
    const name = `<${tag}${labelSuffix}>`;
    const kind: SymbolKind = tag === 'script' ? 'module' : tag === 'template' ? 'class' : 'type';
    const fullCode = lines.slice(i, endLine).join('\n');
    const folded = Math.max(1, lineCount - 2);
    const skeletonCode =
      lineCount > 5
        ? `${lines[i]}\n  <!-- ... ${folded} lines folded -->\n</${tag}>`
        : fullCode;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: true,
        startLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: '',
        shortName: idMatch?.[1] ?? tag,
      }),
    );
  }
  return nodes;
}

function parseCssSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const ruleRe = /^(@media[^{]+|@keyframes\s+[A-Za-z0-9_-]+|:root|[.#A-Za-z_][^\n{;]{1,64})\{/gm;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(content)) !== null) {
    const startIdx = m.index;
    const startLine = getLineNumberAt(content, startIdx);
    const openAbs = startIdx + m[0].lastIndexOf('{');
    const closeAbs = findMatchingBrace(content, openAbs);
    const endLine = getLineNumberAt(content, closeAbs);
    const fullCode = lines.slice(startLine - 1, endLine).join('\n');
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const folded = Math.max(1, endLine - startLine - 1);
    const skeletonCode =
      endLine - startLine + 1 > 5 ? `${selector} { /* ... ${folded} lines folded */ }` : fullCode;

    nodes.push(
      makeAstNode({
        file,
        name: selector,
        kind: 'type',
        exported: true,
        startLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: '',
      }),
    );
  }
  return nodes;
}

function parseRustSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const rsRe =
    /^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(fn|struct|enum|trait|impl(?:<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = rsRe.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    const openRel = content.slice(startIdx).indexOf('{');
    if (openRel === -1) continue;
    const openAbs = startIdx + openRel;
    const closeAbs = findMatchingBrace(content, openAbs);
    const endLine = getLineNumberAt(content, closeAbs);
    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);
    const kw = m[1];
    const name = m[2];
    const kind: SymbolKind =
      kw === 'fn' ? 'function' : kw === 'trait' ? 'interface' : kw.startsWith('impl') ? 'class' : 'type';
    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const header = content.slice(startIdx, openAbs).trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      kind === 'type' || kind === 'interface' || endLine - docStartLine + 1 <= 4
        ? fullCode
        : `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ }`;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: m[0].startsWith('pub'),
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
      }),
    );
  }
  return nodes;
}

function parseJavaKotlinCSharpSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const declRe =
    /^([ \t]*)(?:(?:public|private|protected|internal|static|final|abstract|override|virtual|async|sealed|data|open|suspend)[ \t]+)*(class|interface|enum|record|struct|fun|[A-Za-z_][A-Za-z0-9_<>\[\]?]*)[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?:\([^;{]*\))?[^{;\n]*\{/gm;
  let currentType = '';
  let currentTypeEnd = 0;

  let m: RegExpExecArray | null;
  while ((m = declRe.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    const indent = m[1].length;
    const kwOrRet = m[2];
    const rawName = m[3];
    if (CONTROL_FLOW_WORDS.has(kwOrRet) || CONTROL_FLOW_WORDS.has(rawName)) continue;

    if (declLine > currentTypeEnd) currentType = '';
    const openAbs = startIdx + m[0].lastIndexOf('{');
    const closeAbs = findMatchingBrace(content, openAbs);
    const endLine = getLineNumberAt(content, closeAbs);
    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);

    const isTypeDecl = ['class', 'interface', 'enum', 'record', 'struct'].includes(kwOrRet);
    let kind: SymbolKind = 'function';
    let name = rawName;
    if (isTypeDecl) {
      kind = kwOrRet === 'interface' ? 'interface' : kwOrRet === 'class' ? 'class' : 'type';
      currentType = rawName;
      currentTypeEnd = endLine;
    } else if (indent > 0 && currentType && declLine <= currentTypeEnd) {
      kind = 'method';
      name = `${currentType}.${rawName}`;
    }

    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const header = content.slice(startIdx, openAbs).trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      kind === 'interface' || endLine - docStartLine + 1 <= 4
        ? fullCode
        : `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ }`;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: m[0].includes('public') || !m[0].includes('private'),
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
        shortName: rawName,
      }),
    );
  }
  return nodes;
}

function parseRubySymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(def|class|module)\s+([A-Za-z_][A-Za-z0-9_.:!?]*)/);
    if (!m) continue;
    const baseIndent = m[1].length;
    const kw = m[2];
    const name = m[3];
    const startLine = i + 1;
    let endLine = startLine;
    for (let j = i + 1; j < lines.length; j++) {
      const endM = lines[j].match(/^(\s*)end\b/);
      if (endM && endM[1].length <= baseIndent) {
        endLine = j + 1;
        break;
      }
      endLine = j + 1;
    }
    const fullCode = lines.slice(i, endLine).join('\n');
    const kind: SymbolKind = kw === 'def' ? 'function' : kw === 'class' ? 'class' : 'module';
    const skeletonCode =
      endLine - startLine + 1 > 4
        ? `${lines[i]}\n${m[1]}  # ... ${endLine - startLine - 1} lines folded\n${m[1]}end`
        : fullCode;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: !name.startsWith('_'),
        startLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: '',
      }),
    );
  }
  return nodes;
}

function parseSqlSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const sqlRe =
    /^CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`]+)/gim;
  let m: RegExpExecArray | null;
  while ((m = sqlRe.exec(content)) !== null) {
    const startIdx = m.index;
    const startLine = getLineNumberAt(content, startIdx);
    const semiRel = content.slice(startIdx).indexOf(';');
    const endAbs = semiRel !== -1 ? startIdx + semiRel : content.length - 1;
    const endLine = getLineNumberAt(content, endAbs);
    const fullCode = lines.slice(startLine - 1, endLine).join('\n');
    const objType = m[1].toUpperCase();
    const name = m[2].replace(/["`]/g, '');
    const kind: SymbolKind = objType === 'FUNCTION' || objType === 'PROCEDURE' ? 'function' : 'type';
    const skeletonCode =
      endLine - startLine + 1 > 6
        ? `${lines[startLine - 1]}\n  -- ... ${endLine - startLine} lines folded`
        : fullCode;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: true,
        startLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: '',
      }),
    );
  }
  return nodes;
}

/**
 * Generic fallback parser for languages without a dedicated parser (Lua, Scala, Dart, Zig,
 * Elixir, shell scripts, …). Recognizes keyword-based declarations (`fn` / `func` / `def` /
 * `class` / `struct` / …), shell-style `name() {` blocks, and C-style `type name(args) {`
 * definitions, then slices them with the shared brace/end matching helpers. Files without
 * any recognizable structure fall through to the whole-file module fallback in
 * parseWorkspaceFiles.
 */
const GENERIC_DECL_RE =
  /^[ \t]*(?:(?:pub(?:\([^)]*\))?|public|private|protected|internal|static|final|abstract|override|virtual|async|local|export|global|sealed|open|data|suspend|mutating)[ \t]+)*(fn|func|function|fun|def|sub|proc|procedure|macro|class|struct|interface|trait|impl|enum|object|record|actor|extension|module|namespace)[ \t]+([A-Za-z_][A-Za-z0-9_.:]*)/gm;

const GENERIC_KEYWORD_KIND: Record<string, SymbolKind> = {
  fn: 'function',
  func: 'function',
  function: 'function',
  fun: 'function',
  def: 'function',
  sub: 'function',
  proc: 'function',
  procedure: 'function',
  macro: 'function',
  class: 'class',
  struct: 'type',
  interface: 'interface',
  trait: 'interface',
  impl: 'class',
  enum: 'type',
  object: 'class',
  record: 'class',
  actor: 'class',
  extension: 'class',
  module: 'module',
  namespace: 'module',
};

const GENERIC_COMMENT_PREFIXES = ['//', '#', '--', '/*', '*', ';', '<!--'];

// Zig-style container: `pub const Config = struct { ... }`
const GENERIC_ZIG_TYPE_RE =
  /^[ \t]*(?:pub[ \t]+)?const[ \t]+([A-Za-z_][A-Za-z0-9_.:]*)[ \t]*=[ \t]*(?:packed[ \t]+)?(?:struct|enum|union|error)[ \t]*\{/gm;

// Inner-declaration matchers used for method extraction inside large containers
const GENERIC_INNER_KEYWORD_RE =
  /^[ \t]*(?:(?:pub(?:\([^)]*\))?|public|private|protected|internal|static|final|abstract|override|virtual|async|local|export|global|sealed|open|data|suspend|mutating)[ \t]+)*(fn|func|function|fun|def|sub|proc|procedure)[ \t]+([A-Za-z_][A-Za-z0-9_.:]*)/;
const GENERIC_INNER_CSTYLE_RE =
  /^[ \t]*[A-Za-z_][A-Za-z0-9_<>:*,[\] &]*?[ \t]+([A-Za-z_~][A-Za-z0-9_]*)[ \t]*\([^;{}]*\)[ \t]*(?:const[ \t]*)?(?:noexcept[ \t]*)?\{/;

function isCommentLine(trimmed: string): boolean {
  return GENERIC_COMMENT_PREFIXES.some((p) => trimmed.startsWith(p));
}

/** Finds the absolute index of the opening `{` for a declaration, searching only the decl line and the next two lines. */
function findNearbyBrace(content: string, startIdx: number): number {
  let searchEnd = startIdx;
  for (let k = 0; k < 3 && searchEnd < content.length; k++) {
    const nl = content.indexOf('\n', searchEnd);
    searchEnd = nl === -1 ? content.length : nl + 1;
  }
  const rel = content.slice(startIdx, searchEnd).indexOf('{');
  return rel === -1 ? -1 : startIdx + rel;
}

function parseGenericSymbols(file: CodeFile): AstSymbolNode[] {
  const { content } = file;
  const lines = content.split('\n');
  const nodes: AstSymbolNode[] = [];
  const covered: Array<[number, number]> = [];
  const isCovered = (ln: number) => covered.some(([s, e]) => ln >= s && ln <= e);
  const hasEndTerminators = /^[ \t]*end\b/m.test(content);

  const pushDecl = (name: string, kind: SymbolKind, declLine: number, startIdx: number, braceAbs: number, isBraceMode: boolean) => {
    const lineText = lines[declLine - 1] ?? '';
    const indent = lineText.length - lineText.trimStart().length;
    const indentStr = lineText.slice(0, indent);

    let endLine: number;
    if (isBraceMode) {
      const closeAbs = findMatchingBrace(content, braceAbs);
      endLine = getLineNumberAt(content, closeAbs);
    } else {
      endLine = lines.length;
      for (let j = declLine; j < lines.length; j++) {
        const endM = lines[j].match(/^[ \t]*end\b/);
        if (endM && lines[j].length - lines[j].trimStart().length <= indent) {
          endLine = j + 1;
          break;
        }
      }
    }

    const { doc, docStartLine } = extractLeadingDoc(lines, declLine);
    covered.push([docStartLine, endLine]);
    const fullCode = lines.slice(docStartLine - 1, endLine).join('\n');
    const lineCount = endLine - docStartLine + 1;
    const header = isBraceMode ? content.slice(startIdx, braceAbs).trim() : lineText.trim();
    const folded = Math.max(1, endLine - declLine - 1);
    const skeletonCode =
      lineCount <= 4
        ? fullCode
        : isBraceMode
          ? `${doc ? doc + '\n' : ''}${header} { /* ... ${folded} lines folded */ }`
          : `${lineText}\n${indentStr}  # ... ${folded} lines folded\n${indentStr}end`;

    nodes.push(
      makeAstNode({
        file,
        name,
        kind,
        exported: !header.includes('private') && !name.startsWith('_'),
        startLine: docStartLine,
        endLine,
        fullCode,
        skeletonCode,
        docComment: doc,
      }),
    );

    // Extract methods from containers (class/object/impl/struct bodies) so
    // inner declarations are still individually addressable, mirroring the
    // dedicated TS/JS class slicing behavior.
    if (isBraceMode && lineCount > 4 && (kind === 'class' || kind === 'type' || kind === 'module')) {
      const bodyStartLine = getLineNumberAt(content, braceAbs) + 1;
      for (let ln = bodyStartLine; ln < endLine; ln++) {
        const rawLine = lines[ln - 1] ?? '';
        const rawTrim = rawLine.trim();
        if (!rawTrim || isCommentLine(rawTrim)) continue;

        const kwMatch = rawLine.match(GENERIC_INNER_KEYWORD_RE);
        const cMatch = kwMatch ? null : rawLine.match(GENERIC_INNER_CSTYLE_RE);
        const innerName = kwMatch ? kwMatch[2] : cMatch ? cMatch[1] : null;
        if (!innerName || CONTROL_FLOW_WORDS.has(innerName)) continue;

        const lineOffsetAbs = lines.slice(0, ln - 1).join('\n').length + (ln > 1 ? 1 : 0);
        const innerBraceRel = content.slice(lineOffsetAbs).indexOf('{');
        if (innerBraceRel === -1) continue;
        const innerBraceAbs = lineOffsetAbs + innerBraceRel;
        const innerEndAbs = findMatchingBrace(content, innerBraceAbs);
        const innerEndLine = getLineNumberAt(content, innerEndAbs);
        if (innerEndLine >= endLine || innerEndLine - ln < 3) continue;

        covered.push([ln, innerEndLine]);
        const innerFull = lines.slice(ln - 1, innerEndLine).join('\n');
        const innerHeader = content.slice(lineOffsetAbs, innerBraceAbs).trim();
        const innerFolded = Math.max(1, innerEndLine - ln - 1);
        const innerSkel =
          innerEndLine - ln + 1 <= 4
            ? innerFull
            : `${innerHeader} { /* ... ${innerFolded} lines folded */ }`;

        nodes.push(
          makeAstNode({
            file,
            name: `${name}.${innerName}`,
            qualifiedName: `${name}.${innerName}`,
            kind: 'method',
            exported: !innerHeader.includes('private'),
            startLine: ln,
            endLine: innerEndLine,
            fullCode: innerFull,
            skeletonCode: innerSkel,
            docComment: '',
            shortName: innerName,
          }),
        );
        ln = innerEndLine - 1;
      }
    }
  };

  // 1. Keyword-based declarations (most dynamic & brace-less languages)
  let m: RegExpExecArray | null;
  while ((m = GENERIC_DECL_RE.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    if (isCovered(declLine)) continue;
    const trimmed = (lines[declLine - 1] ?? '').trim();
    if (isCommentLine(trimmed)) continue;
    if (CONTROL_FLOW_WORDS.has(m[2])) continue;

    const braceAbs = findNearbyBrace(content, startIdx);
    if (braceAbs === -1 && !hasEndTerminators) continue;
    pushDecl(m[2], GENERIC_KEYWORD_KIND[m[1]] ?? 'function', declLine, startIdx, braceAbs, braceAbs !== -1);
  }

  // 1b. Zig-style containers: `pub const Config = struct { ... }`
  while ((m = GENERIC_ZIG_TYPE_RE.exec(content)) !== null) {
    const startIdx = m.index;
    const declLine = getLineNumberAt(content, startIdx);
    if (isCovered(declLine)) continue;
    const trimmed = (lines[declLine - 1] ?? '').trim();
    if (isCommentLine(trimmed)) continue;
    pushDecl(m[1], 'type', declLine, startIdx, startIdx + m[0].lastIndexOf('{'), true);
  }

  // 2. Fallbacks for files without keyword declarations
  if (nodes.length === 0) {
    // Shell-style: name() { ... }
    const shellRe = /^[ \t]*([A-Za-z_][A-Za-z0-9_-]*)[ \t]*\(\)[ \t]*\{/gm;
    while ((m = shellRe.exec(content)) !== null) {
      const declLine = getLineNumberAt(content, m.index);
      if (isCovered(declLine)) continue;
      if (CONTROL_FLOW_WORDS.has(m[1])) continue;
      pushDecl(m[1], 'function', declLine, m.index, m.index + m[0].lastIndexOf('{'), true);
    }
  }

  // 3. C-style: return_type name(args) { ... } (Dart, Vala, generic C-like languages).
  // Runs unconditionally; isCovered() dedupes against keyword / container matches.
  {
    const cStyleRe =
      /^[ \t]*([A-Za-z_][A-Za-z0-9_<>:*,[\] &]*?)[ \t]+([A-Za-z_~][A-Za-z0-9_]*)[ \t]*\([^;{}]*\)[ \t]*(?:const[ \t]*)?(?:noexcept[ \t]*)?\{/gm;
    while ((m = cStyleRe.exec(content)) !== null) {
      const declLine = getLineNumberAt(content, m.index);
      if (isCovered(declLine)) continue;
      if (CONTROL_FLOW_WORDS.has(m[2])) continue;
      pushDecl(m[2], 'function', declLine, m.index, m.index + m[0].lastIndexOf('{'), true);
    }
  }

  return nodes;
}

function resolveImportPath(fromPath: string, spec: string, allFiles: CodeFile[]): string | null {
  if (!spec.startsWith('.')) return null;
  const fromParts = fromPath.split('/').slice(0, -1);
  const specParts = spec.split('/');
  const stack = [...fromParts];
  for (const part of specParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const base = stack.join('/');
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  for (const cand of candidates) {
    const found = allFiles.find((f) => f.path === cand || f.path.endsWith(`/${cand}`));
    if (found) return found.id;
  }
  return null;
}

export function parseWorkspaceFiles(
  rawFiles: Array<{ path: string; content: string }>,
): ParsedWorkspace {
  const files: CodeFile[] = rawFiles.map((rf, idx) => {
    const cleanPath = rf.path.replace(/^\/+/, '');
    const lines = rf.content.split('\n').length;
    const rawTokens = estimateTokens(rf.content);
    return {
      id: `file_${idx}_${cleanPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
      path: cleanPath,
      language: detectLanguage(cleanPath),
      content: rf.content,
      lineCount: lines,
      rawTokens,
      isOversized: lines >= 220 || rawTokens >= 1800,
    };
  });

  const nodes: AstSymbolNode[] = [];
  const fileImports: Record<string, FileImport[]> = {};

  for (const file of files) {
    let extracted: AstSymbolNode[] = [];
    if (file.language === 'typescript' || file.language === 'javascript') {
      fileImports[file.id] = parseTsJsImports(file.content).map((imp) => ({
        ...imp,
        resolvedFileId: resolveImportPath(file.path, imp.rawSpecifier, files),
      }));
      extracted = parseTsJsSymbols(file);
    } else if (file.language === 'python') {
      fileImports[file.id] = parsePythonImports(file.content, files);
      extracted = parsePythonSymbols(file);
    } else if (file.language === 'go') {
      fileImports[file.id] = parseGoImports(file.content, files);
      extracted = parseGoSymbols(file);
    } else if (file.language === 'c' || file.language === 'cpp') {
      fileImports[file.id] = parseCIncludes(file.path, file.content, files);
      extracted = parseCCppSymbols(file);
    } else if (file.language === 'swift') {
      fileImports[file.id] = [];
      extracted = parseSwiftSymbols(file);
    } else if (file.language === 'php') {
      fileImports[file.id] = parsePhpImports(file.path, file.content, files);
      extracted = parsePhpSymbols(file);
    } else if (file.language === 'html') {
      fileImports[file.id] = parseHtmlImports(file.path, file.content, files);
      extracted = parseHtmlSymbols(file);
    } else if (file.language === 'css') {
      fileImports[file.id] = [];
      extracted = parseCssSymbols(file);
    } else if (file.language === 'rust') {
      fileImports[file.id] = [];
      extracted = parseRustSymbols(file);
    } else if (file.language === 'java' || file.language === 'csharp') {
      fileImports[file.id] = [];
      extracted = parseJavaKotlinCSharpSymbols(file);
    } else if (file.language === 'ruby') {
      fileImports[file.id] = [];
      extracted = parseRubySymbols(file);
    } else if (file.language === 'sql') {
      fileImports[file.id] = [];
      extracted = parseSqlSymbols(file);
    } else {
      // Unknown language: try the generic declaration slicer, then fall back to a
      // whole-file module node below if nothing recognizable is found.
      fileImports[file.id] = [];
      extracted = parseGenericSymbols(file);
    }

    // Fallback: if a file has no extracted top-level symbols, represent the file itself as a module node
    if (extracted.length === 0) {
      const lines = file.content.split('\n');
      const previewSkeleton =
        lines.length > 16
          ? `${lines.slice(0, 8).join('\n')}\n// ... ${lines.length - 8} lines folded`
          : file.content;
      extracted.push({
        id: `${file.id}::module@1`,
        fileId: file.id,
        filePath: file.path,
        name: file.path.split('/').pop() ?? file.path,
        qualifiedName: file.path,
        kind: 'module',
        exported: true,
        startLine: 1,
        endLine: file.lineCount,
        lineCount: file.lineCount,
        fullCode: file.content,
        skeletonCode: previewSkeleton,
        rawTokens: file.rawTokens,
        skeletonTokens: estimateTokens(previewSkeleton),
        mapTokens: estimateTokens(`${file.path} (${file.lineCount} lines)`),
        docComment: '',
        referencedIdentifiers: extractIdentifiers(file.content, ''),
      });
    }

    nodes.push(...extracted);
  }

  // Build symbol-level & cross-file dependency edges
  const edges: DependencyEdge[] = [];
  const edgeKeys = new Set<string>();
  const nodesByName = new Map<string, AstSymbolNode[]>();

  for (const node of nodes) {
    // Index by plain name and method suffix
    const shortName = node.name.includes('.') ? node.name.split('.').pop()! : node.name;
    const list = nodesByName.get(shortName) ?? [];
    list.push(node);
    nodesByName.set(shortName, list);
  }

  for (const src of nodes) {
    const importsForFile = fileImports[src.fileId] ?? [];
    const importedFileIds = new Set(
      importsForFile.map((i) => i.resolvedFileId).filter(Boolean) as string[],
    );

    for (const refId of src.referencedIdentifiers) {
      const candidates = nodesByName.get(refId);
      if (!candidates) continue;

      for (const target of candidates) {
        if (target.id === src.id) continue;
        // Avoid parent class <-> own method noise
        if (
          src.fileId === target.fileId &&
          ((src.kind === 'class' && target.kind === 'method' && target.name.startsWith(`${src.name}.`)) ||
            (target.kind === 'class' && src.kind === 'method' && src.name.startsWith(`${target.name}.`)))
        ) {
          continue;
        }

        const sameFile = src.fileId === target.fileId;
        const srcDir = src.filePath.split('/').slice(0, -1).join('/');
        const dstDir = target.filePath.split('/').slice(0, -1).join('/');
        const sameGoPkg =
          src.filePath.endsWith('.go') &&
          target.filePath.endsWith('.go') &&
          srcDir === dstDir &&
          src.fileId !== target.fileId;
        const explicitlyImported = importedFileIds.has(target.fileId) || sameGoPkg;

        if (sameFile || explicitlyImported) {
          const edgeKind = sameFile ? 'intra-file' : 'calls';
          const key = `${src.id}->${target.id}`;
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            edges.push({
              id: key,
              sourceNodeId: src.id,
              targetNodeId: target.id,
              sourceFileId: src.fileId,
              targetFileId: target.fileId,
              kind: edgeKind,
              weight: sameFile ? 2 : 3,
            });
          }
        }
      }
    }
  }

  // Ensure file-level imports without direct function call match still create an import edge to the primary symbol
  for (const file of files) {
    const srcPrimary = nodes.find((n) => n.fileId === file.id);
    if (!srcPrimary) continue;
    for (const imp of fileImports[file.id] ?? []) {
      if (!imp.resolvedFileId) continue;
      const targetNodes = nodes.filter((n) => n.fileId === imp.resolvedFileId);
      for (const impName of imp.importedNames) {
        const matchedTarget = targetNodes.find((t) => t.name === impName) ?? targetNodes[0];
        if (!matchedTarget) continue;
        const key = `${srcPrimary.id}->${matchedTarget.id}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          edges.push({
            id: key,
            sourceNodeId: srcPrimary.id,
            targetNodeId: matchedTarget.id,
            sourceFileId: file.id,
            targetFileId: imp.resolvedFileId,
            kind: 'import',
            weight: 1,
          });
        }
      }
    }
  }

  const totalRawTokens = files.reduce((acc, f) => acc + f.rawTokens, 0);
  const totalLines = files.reduce((acc, f) => acc + f.lineCount, 0);

  return {
    files,
    nodes,
    edges,
    fileImports,
    totalRawTokens,
    totalLines,
  };
}
