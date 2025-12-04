const { doc } = require("prettier");
const { concat, hardline } = doc.builders;

// =============================================================================
// PATTERNS AND CONSTANTS
// =============================================================================

const HTML_TAG_PATTERN = "[A-Za-z][A-Za-z0-9-]*";
const DYNAMIC_TAG_PATTERN = "\\$\\{[^}]+\\}";
const TAG_NAME_PATTERN = `(?:${HTML_TAG_PATTERN}|${DYNAMIC_TAG_PATTERN})`;

const INLINE_HTML_TAGS = new Set([
  "span",
  "b",
  "i",
  "em",
  "strong",
  "small",
  "label",
  "a",
]);

const FTL_BLOCK_OPENERS = [
  "<#if",
  "<#list",
  "<#macro",
  "<#function",
  "<#switch",
  "<#attempt",
  "<#compress",
  "<#escape",
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractTagName = (line) => {
  const match = line.match(new RegExp(`^<(${TAG_NAME_PATTERN})`));
  return match ? match[1] : null;
};

const getPrintWidth = (options = {}) =>
  typeof options.printWidth === "number" ? options.printWidth : 80;

// =============================================================================
// LINE CLASSIFICATION - Unified trait detection
// =============================================================================

const classify = {
  // FTL block openers: <#if>, <#list>, <#macro>, etc.
  isFtlOpener: (t) => {
    // Block-form assign/local/global (without =)
    if (/^<#(assign|local|global)\b/.test(t) && !t.includes("=")) return true;
    return FTL_BLOCK_OPENERS.some((prefix) => t.startsWith(prefix));
  },

  // FTL block closers: </#...>
  isFtlCloser: (t) => /^<\/#/.test(t),

  // FTL intermediate tags that need dedent before, indent after
  isFtlIntermediate: (t) => /^<#(else|elseif|recover)\b/.test(t),

  // Switch case/default - similar to intermediate but within switch context
  isCaseLike: (t) => /^<#(case|default)\b/.test(t),

  // Switch specific
  isSwitchOpener: (t) => /^<#switch\b/.test(t),
  isSwitchCloser: (t) => /^<\/#switch>/.test(t),

  // Macro calls: <@name ...>
  isMacroOpener: (t) => {
    if (/\/>/.test(t)) return false;
    if (t.includes("</@")) return false;
    return /^<@[A-Za-z_][A-Za-z0-9_.-]*/.test(t);
  },

  // Macro closers: </@name>
  isMacroCloser: (t) => /^<\/@[A-Za-z_][A-Za-z0-9_.-]*>/.test(t),

  // HTML openers: <tag ...> (non-self-closing, non-inline)
  isHtmlOpener: (t) => {
    if (!t.startsWith("<")) return false;
    if (["</", "<#", "[#", "<@", "<!", "<?"].some((p) => t.startsWith(p)))
      return false;
    if (/\/>\s*$/.test(t)) return false;

    const tagName = extractTagName(t);
    const normalized =
      tagName && !tagName.startsWith("${") ? tagName.toLowerCase() : null;

    // Inline tags that have their closing on the same line don't count as openers
    if (normalized && INLINE_HTML_TAGS.has(normalized)) {
      const gtIndex = t.indexOf(">");
      if (gtIndex !== -1) {
        const after = t.slice(gtIndex + 1);
        if (new RegExp(`</${normalized}\\b`).test(after)) return false;
      }
    }
    return true;
  },

  // Self-closing: ends with />
  isSelfClosing: (t) => /\/>\s*$/.test(t),

  // JSON openers: ends with { or [
  isJsonOpener: (t) => /{\s*$/.test(t) || /\[\s*$/.test(t),

  // JSON closers: starts with } or ]
  isJsonCloser: (t) => t.startsWith("}") || t.startsWith("]"),

  // Inline blocks - complete open/close on same line
  isInline: (t) => {
    // Inline FTL block: <#...> ... </#...>
    if (t.startsWith("<#") && t.includes("</#")) return true;

    // Inline macro: <@...> ... </@...>
    if (/<@[A-Za-z_][A-Za-z0-9_.-]*[^>]*>.*<\/@/.test(t)) return true;

    // Self-closing macro: <@... />
    if (t.startsWith("<@") && /\/>\s*$/.test(t) && !t.includes("</@"))
      return true;

    // Inline HTML: <tag>...</tag>
    if (
      t.startsWith("<") &&
      !["</", "<#", "<@", "<!", "<?"].some((p) => t.startsWith(p))
    ) {
      const m = t.match(new RegExp(`^<(${TAG_NAME_PATTERN})(\\s|>)`));
      if (m) {
        const tag = m[1];
        const gtIndex = t.indexOf(">");
        if (gtIndex !== -1) {
          const after = t.slice(gtIndex + 1);
          if (new RegExp(`</\\s*${escapeRegex(tag)}\\s*>`).test(after))
            return true;
        }
      }
    }

    return false;
  },
};

// Count HTML closing tags in a line
const countHtmlClosings = (t, leadingOnly = false) => {
  const pattern = new RegExp(`</${TAG_NAME_PATTERN}\\s*>`, "g");
  if (leadingOnly) {
    let count = 0;
    let rest = t.trim();
    while (true) {
      const match = rest.match(new RegExp(`^</${TAG_NAME_PATTERN}\\s*>\\s*`));
      if (!match) break;
      count++;
      rest = rest.slice(match[0].length);
    }
    return count;
  }
  let count = 0;
  while (pattern.exec(t)) count++;
  return count;
};

// =============================================================================
// LINE SPLITTING - Break long lines at tag boundaries
// =============================================================================

const splitLongLine = (line, printWidth) => {
  const trimmed = line.trim();
  if (trimmed.length <= printWidth) return [trimmed];

  const hasTag = new RegExp(`</?${TAG_NAME_PATTERN}`).test(trimmed);
  if (!hasTag) return [trimmed];

  const parts = [];
  let start = 0;
  let lastBreakable = -1;
  let inQuote = null;
  let inTag = false;

  const push = (endIndex) => {
    const piece = trimmed.slice(start, endIndex + 1).trim();
    if (piece) parts.push(piece);
    start = endIndex + 1;
    while (start < trimmed.length && /\s/.test(trimmed[start])) start++;
    lastBreakable = -1;
  };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const prev = trimmed[i - 1];

    if (!inTag && ch === "<" && !inQuote && prev !== "\\") inTag = true;

    if (inTag && prev !== "\\") {
      if ((ch === '"' || ch === "'") && !inQuote) inQuote = ch;
      else if (ch === inQuote) inQuote = null;
    }

    if (!inTag && !inQuote && /\s/.test(ch)) lastBreakable = i;

    if (inTag && !inQuote && ch === ">") {
      inTag = false;
      let j = i + 1;
      while (j < trimmed.length && /\s/.test(trimmed[j])) j++;
      if (j < trimmed.length && trimmed[j] === "<") {
        push(i);
        i = j - 1;
        continue;
      }
      lastBreakable = i;
    }

    if (i - start + 1 > printWidth && lastBreakable >= start) {
      push(lastBreakable);
      i = start - 1;
    }
  }

  const tail = trimmed.slice(start).trim();
  if (tail) parts.push(tail);

  return parts.length > 0 ? parts : [trimmed];
};

// =============================================================================
// LOGICAL LINE BUILDING - Handle multi-line macro attributes
// =============================================================================

const buildLogicalLines = (text, options = {}) => {
  const printWidth = getPrintWidth(options);
  const lines = text.split(/\r?\n/);
  const result = [];
  let pendingMacro = null;

  const flushMacro = (forceSplit = false) => {
    if (!pendingMacro) return;
    const joined = pendingMacro.map((l) => l.trim()).join(" ");
    const shouldJoin = !forceSplit && /\/>\s*$/.test(joined);
    const toProcess = shouldJoin ? [joined] : pendingMacro;
    for (const line of toProcess) {
      result.push(...splitLongLine(line, printWidth));
    }
    pendingMacro = null;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (pendingMacro) {
      pendingMacro.push(trimmed);
      if (/>\s*$/.test(trimmed)) flushMacro(!/\/>\s*$/.test(trimmed));
      continue;
    }

    if (trimmed === "") {
      result.push("");
      continue;
    }

    // Multi-line macro: starts with <@ but no closing >
    if (
      /^<@/.test(trimmed) &&
      !/>\s*$/.test(trimmed) &&
      !/<\/@/.test(trimmed)
    ) {
      pendingMacro = [trimmed];
      continue;
    }

    const pieces = splitLongLine(trimmed, printWidth);
    result.push(...(pieces.length ? pieces : [""]));
  }

  flushMacro(true);
  return result;
};

// =============================================================================
// FORMATTER - Unified indentation logic
// =============================================================================

function formatFtlText(text, options = {}) {
  const lines = buildLogicalLines(text, options);
  const result = [];
  const indentUnit = options.useTabs
    ? "\t"
    : " ".repeat(typeof options.tabWidth === "number" ? options.tabWidth : 2);

  // Unified indent level - no separate counters
  let indent = 0;

  // Track switch nesting for case/default handling
  const switchStack = [];

  for (const rawLine of lines) {
    const t = rawLine.trim();

    if (t === "") {
      result.push("");
      continue;
    }

    // Inline elements: complete block on one line, no indent change
    if (classify.isInline(t)) {
      result.push(indentUnit.repeat(indent) + t);
      continue;
    }

    const isSelfClosing = classify.isSelfClosing(t);
    const leadingHtmlClosings = countHtmlClosings(t, true);
    const totalHtmlClosings = countHtmlClosings(t, false);
    const trailingHtmlClosings = totalHtmlClosings - leadingHtmlClosings;

    // === PRE-LINE ADJUSTMENTS (dedent before printing) ===

    // FTL closers: </#...>
    if (classify.isFtlCloser(t)) {
      // Switch closer also pops the case indent
      if (classify.isSwitchCloser(t) && switchStack.length > 0) {
        const sw = switchStack.pop();
        if (sw.hasCase) indent = Math.max(0, indent - 1);
      }
      indent = Math.max(0, indent - 1);
    }

    // FTL intermediate: <#else>, <#elseif>, <#recover>
    if (classify.isFtlIntermediate(t)) {
      indent = Math.max(0, indent - 1);
    }

    // Case/default: dedent if we already have a case in this switch
    if (classify.isCaseLike(t)) {
      const current = switchStack[switchStack.length - 1];
      if (current && current.hasCase) {
        indent = Math.max(0, indent - 1);
      }
    }

    // JSON closers: } or ]
    if (classify.isJsonCloser(t)) {
      indent = Math.max(0, indent - 1);
    }

    // HTML closing tags at start of line
    if (leadingHtmlClosings > 0) {
      indent = Math.max(0, indent - leadingHtmlClosings);
    }

    // Macro closers: </@...> or standalone />
    if (classify.isMacroCloser(t) || t === "/>") {
      indent = Math.max(0, indent - 1);
    }

    // === PRINT THE LINE ===

    result.push(indentUnit.repeat(indent) + t);

    // === POST-LINE ADJUSTMENTS (indent for next line) ===

    // FTL openers
    if (classify.isFtlOpener(t) && !isSelfClosing) {
      indent++;
      if (classify.isSwitchOpener(t)) {
        switchStack.push({ hasCase: false });
      }
    }

    // FTL intermediate: indent after <#else> etc.
    if (classify.isFtlIntermediate(t)) {
      indent++;
    }

    // Case/default: mark switch as having case, then indent
    if (classify.isCaseLike(t)) {
      if (switchStack.length > 0) {
        switchStack[switchStack.length - 1].hasCase = true;
      }
      indent++;
    }

    // JSON openers
    if (classify.isJsonOpener(t)) {
      indent++;
    }

    // HTML openers (but handle closings on the same line)
    if (classify.isHtmlOpener(t)) {
      indent++;
    }

    // Macro openers
    if (classify.isMacroOpener(t)) {
      indent++;
    }

    // HTML closing tags after content on same line
    if (trailingHtmlClosings > 0) {
      indent = Math.max(0, indent - trailingHtmlClosings);
    }
  }

  return result.join("\n");
}

const printers = {
  "freemarker-ast": {
    print: (path, options) => {
      const node = path.getValue();
      const text = node && node.body ? node.body : "";
      const formatted = formatFtlText(text, options);

      const lines = formatted.split(/\r?\n/);
      if (lines.length === 0) return "";

      return concat(
        lines.map((line, index) =>
          index === 0 ? line : concat([hardline, line]),
        ),
      );
    },
  },
};

module.exports = printers;
