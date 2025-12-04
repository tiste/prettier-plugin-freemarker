const { doc } = require("prettier");
const { concat, hardline } = doc.builders;

const INLINE_TAGS = new Set([
  "span",
  "b",
  "i",
  "em",
  "strong",
  "small",
  "label",
  "a",
]);

const HTML_TAG_NAME_PATTERN = "[A-Za-z][A-Za-z0-9-]*";
const DYNAMIC_TAG_NAME_PATTERN = "\\$\\{[^}]+\\}";
const ANY_TAG_NAME_PATTERN = `(?:${HTML_TAG_NAME_PATTERN}|${DYNAMIC_TAG_NAME_PATTERN})`;

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matchTagName = (t) => {
  const match = t.match(new RegExp(`^<(${ANY_TAG_NAME_PATTERN})`));
  return match ? match[1] : null;
};

// --- Helpers FTL généraux ---
const isFtlClosingTag = (t) => /^<\/#/.test(t.trim());
const isElseLike = (t) => /^<#(else|elseif|recover)\b/.test(t.trim());
const isCaseLike = (t) => /^<#(case|default)\b/.test(t.trim());

const isFtlBlockOpener = (t) => {
  t = t.trim();
  const startsWith = (prefix) => t.startsWith(prefix);

  if (
    (startsWith("<#assign") ||
      startsWith("<#local") ||
      startsWith("<#global")) &&
    !t.includes("=")
  ) {
    return true;
  }

  return [
    "<#if",
    "<#list",
    "<#macro",
    "<#function",
    "<#switch",
    "<#attempt",
    "<#compress",
    "<#escape",
  ].some((prefix) => startsWith(prefix));
};

// --- Helpers HTML ---
const isHtmlOpener = (t) => {
  t = t.trim();
  if (!t.startsWith("<")) return false;

  if (["</", "<#", "[#", "<@", "<!", "<?"].some((p) => t.startsWith(p)))
    return false;

  const tagName = matchTagName(t);
  const normalizedTag =
    tagName && !tagName.startsWith("${") ? tagName.toLowerCase() : null;

  if (/\/>\s*$/.test(t)) return false;

  if (normalizedTag && INLINE_TAGS.has(normalizedTag)) {
    const firstGt = t.indexOf(">");
    if (firstGt !== -1) {
      const after = t.slice(firstGt + 1);
      const closeRe = new RegExp(`</${normalizedTag}\\b`);
      if (closeRe.test(after)) return false;
    }
    return true;
  }

  return true;
};

// --- Helpers Macros <@...> ---
const isMacroOpener = (t) => {
  t = t.trim();
  if (/\/>/.test(t)) return false;
  if (t.includes("</@")) return false;
  return /^<@[A-Za-z_][A-Za-z0-9_.-]*/.test(t);
};

const isMacroClosing = (t) => /^<\/@[A-Za-z_][A-Za-z0-9_.-]*>/.test(t.trim());

// --- Helpers HTML closing tags ---
const countHtmlClosingTags = (t) => {
  const closingRe = new RegExp(`</${ANY_TAG_NAME_PATTERN}\\s*>`, "g");
  let count = 0;
  while (closingRe.exec(t)) count++;
  return count;
};

const countLeadingHtmlClosings = (t) => {
  let count = 0;
  let rest = t.trim();
  while (true) {
    const match = rest.match(
      new RegExp(`^</${ANY_TAG_NAME_PATTERN}\\s*>\\s*`),
    );
    if (!match) break;
    count++;
    rest = rest.slice(match[0].length);
  }
  return count;
};

// --- Inline blocks FTL / HTML / Macro sur une ligne ---
const isInlineAssignBlock = (t) =>
  /<#assign\b[^>]*>.*<\/#assign>/.test(t.trim());
const isInlineFtlBlock = (t) => {
  t = t.trim();
  return t.startsWith("<#") && t.includes("</#");
};
const isInlineHtmlBlock = (t) => {
  t = t.trim();
  if (!t.startsWith("<")) return false;
  if (["</", "<#", "<@", "<!", "<?"].some((p) => t.startsWith(p))) return false;

  const m = t.match(new RegExp(`^<(${ANY_TAG_NAME_PATTERN})(\\s|>)`));
  if (!m) return false;
  const tag = m[1];
  const firstGt = t.indexOf(">");
  if (firstGt === -1) return false;
  const after = t.slice(firstGt + 1);
  const closeRe = new RegExp(`</\\s*${escapeRegex(tag)}\\s*>`);
  return closeRe.test(after);
};
const isInlineMacroBlock = (t) =>
  /<@[A-Za-z_][A-Za-z0-9_.-]*\b[^>]*>.*<\/@[A-Za-z_][A-Za-z0-9_.-]*>/.test(
    t.trim(),
  );
const isSelfClosingMacroLine = (t) => {
  t = t.trim();
  return t.startsWith("<@") && /\/>\s*$/.test(t) && !t.includes("</@");
};

const getPrintWidth = (options = {}) =>
  typeof options.printWidth === "number" ? options.printWidth : 80;

const splitLongLine = (line, printWidth) => {
  const trimmed = line.trim();
  if (trimmed.length <= printWidth) return [trimmed];

  const containsHtmlTag = new RegExp(`</?${ANY_TAG_NAME_PATTERN}`).test(
    trimmed,
  );
  const parts = [];
  let start = 0;
  let lastBreakable = -1;
  let inSingle = false;
  let inDouble = false;
  let inTag = false;

  const push = (endIndex) => {
    const piece = trimmed.slice(start, endIndex + 1).trim();
    if (piece !== "") parts.push(piece);
    start = endIndex + 1;
    while (start < trimmed.length && /\s/.test(trimmed[start])) start++;
    lastBreakable = -1;
  };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const prev = trimmed[i - 1];
    const escaped = prev === "\\";

    if (!inTag && !escaped && ch === "<" && !inSingle && !inDouble) {
      inTag = true;
    }

    if (inTag && !escaped) {
      if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === "'" && !inDouble) inSingle = !inSingle;
    }

    if (containsHtmlTag && !inTag && !inSingle && !inDouble && /\s/.test(ch)) {
      lastBreakable = i;
    }

    if (inTag && !inSingle && !inDouble && ch === ">") {
      inTag = false;

      let j = i + 1;
      while (j < trimmed.length && /\s/.test(trimmed[j])) j++;
      if (j < trimmed.length && trimmed[j] === "<") {
        push(i);
        i = j - 1; // resume right before the next tag
        continue;
      }

      if (containsHtmlTag) lastBreakable = i;
    }

    if (
      containsHtmlTag &&
      i - start + 1 > printWidth &&
      lastBreakable >= start
    ) {
      push(lastBreakable);
      i = start - 1;
    }
  }

  const tail = trimmed.slice(start).trim();
  if (tail !== "") parts.push(tail);

  return parts.length > 0 ? parts : [trimmed];
};

const buildLogicalLines = (text, options = {}) => {
  const printWidth = getPrintWidth(options);
  const logicalLines = [];

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") {
      logicalLines.push("");
      continue;
    }

    const pieces = splitLongLine(raw, printWidth);
    if (pieces.length === 0) {
      logicalLines.push("");
      continue;
    }

    logicalLines.push(...pieces);
  }

  return logicalLines;
};

// --- Formatter FTL / HTML / JSON / Macros ---
function formatFtlText(text, options = {}) {
  const lines = buildLogicalLines(text, options);
  const result = [];
  const indentUnit = options.useTabs
    ? "\t"
    : " ".repeat(typeof options.tabWidth === "number" ? options.tabWidth : 4);

  const state = {
    ftl: 0, // blocs FTL : <#if>, <#list>, <#switch>, <#macro>, <#function>, assign/local/global-wrap, ...
    json: 0, // { ... }, [ ... ]
    html: 0, // <div>, <ul>, <li>, <h4>, etc.
    macro: 0, // <@macro> ... </@macro> ou multi-ligne avec />
    pendingHtmlMultiline: 0,
    switchStack: [], // pile de switch { hasCase }
  };

  const isInlineLine = (t) =>
    isInlineAssignBlock(t) ||
    isInlineFtlBlock(t) ||
    isInlineHtmlBlock(t) ||
    isInlineMacroBlock(t) ||
    isSelfClosingMacroLine(t);

  const applyPreAdjustments = (flags) => {
    const {
      jsonClose,
      leadingHtmlClosings,
      isCaseLine,
      isElseLine,
      ftlCloseLine,
      isSwitchClosing,
    } = flags;

    if (isSwitchClosing && state.switchStack.length > 0) {
      const top = state.switchStack.pop();
      if (top.hasCase && state.ftl > 0) state.ftl--;
    }

    if (ftlCloseLine && state.ftl > 0) state.ftl--;
    if (isElseLine && state.ftl > 0) state.ftl--;

    if (isCaseLine && state.ftl > 0) {
      const top = state.switchStack[state.switchStack.length - 1];
      if (top && top.hasCase) state.ftl--;
    }

    if (jsonClose && state.json > 0) state.json--;

    if (leadingHtmlClosings > 0 && state.html > 0) {
      const dec = Math.min(leadingHtmlClosings, state.html);
      state.html = Math.max(0, state.html - dec);
      state.pendingHtmlMultiline = Math.max(
        0,
        state.pendingHtmlMultiline - dec,
      );
    }
  };

  const applyPostAdjustments = (t, flags) => {
    const {
      jsonOpen,
      selfClosing,
      isElseLine,
      isCaseLine,
      isSwitchOpener,
      isHtmlOpening,
      isMacroOpening,
      htmlClosingsAfterContent,
    } = flags;

    if (jsonOpen) state.json++;

    if (isFtlBlockOpener(t) && !selfClosing) state.ftl++;
    if ((isElseLine || isCaseLine) && !selfClosing) state.ftl++;

    if (isSwitchOpener && !selfClosing)
      state.switchStack.push({ hasCase: false });
    if (isCaseLine && state.switchStack.length > 0) {
      state.switchStack[state.switchStack.length - 1].hasCase = true;
    }

    if (isHtmlOpening) {
      state.html++;
      if (!/>\s*$/.test(t)) state.pendingHtmlMultiline++;
    }

    if (isMacroOpening) state.macro++;

    if (htmlClosingsAfterContent > 0) {
      const dec = Math.min(htmlClosingsAfterContent, state.html);
      state.html = Math.max(0, state.html - dec);
      state.pendingHtmlMultiline = Math.max(
        0,
        state.pendingHtmlMultiline - dec,
      );
    }

    if (
      state.pendingHtmlMultiline > 0 &&
      !t.startsWith("<") &&
      />\s*$/.test(t)
    ) {
      state.pendingHtmlMultiline--;
      if (selfClosing && state.html > 0) state.html--;
    }
  };

  const buildFlags = (t, leadingHtmlClosings, htmlClosingsAfterContent) => {
    const jsonClose = t.startsWith("}") || t.startsWith("]");
    const jsonOpen = /{\s*$/.test(t) || /\[\s*$/.test(t);
    const selfClosing = /\/>\s*$/.test(t);
    const isCaseLine = isCaseLike(t);
    const isElseLine = isElseLike(t);
    const ftlCloseLine = isFtlClosingTag(t);
    const isSwitchOpener = /^<#switch\b/.test(t);
    const isSwitchClosing = /^<\/#switch>/.test(t);
    const isMacroClosingLine = isMacroClosing(t) || t === "/>";
    const isMacroOpening = isMacroOpener(t);
    const isHtmlOpening = isHtmlOpener(t);

    return {
      jsonClose,
      jsonOpen,
      selfClosing,
      isCaseLine,
      isElseLine,
      ftlCloseLine,
      isSwitchOpener,
      isSwitchClosing,
      isMacroClosingLine,
      isMacroOpening,
      isHtmlOpening,
      leadingHtmlClosings,
      htmlClosingsAfterContent,
    };
  };

  for (let rawLine of lines) {
    const t = rawLine.trim();
    const totalHtmlClosings = countHtmlClosingTags(t);
    const leadingHtmlClosings = countLeadingHtmlClosings(t);
    const htmlClosingsAfterContent = Math.max(
      0,
      totalHtmlClosings - leadingHtmlClosings,
    );

    if (t === "") {
      result.push("");
      continue;
    }

    // Cas spéciaux inline qu'on ne veut pas faire bouger les compteurs :
    //  - <#assign ...> ... </#assign> sur une ligne
    //  - <#if ...> ... </#if> ou <#list ...> ... </#list> sur une ligne (NOUVEAU)
    //  - <tag>...</tag> sur une ligne
    //  - <@macro ...>...</@macro> sur une ligne
    //  - <@macro ... /> (ligne qui COMMENCE par la macro)
    if (isInlineLine(t)) {
      const totalIndent = state.ftl + state.json + state.html + state.macro;
      result.push(indentUnit.repeat(totalIndent) + t);
      continue;
    }

    const flags = buildFlags(t, leadingHtmlClosings, htmlClosingsAfterContent);

    applyPreAdjustments(flags);

    if (flags.isMacroClosingLine && state.macro > 0) {
      state.macro--;
    }

    // --- IMPRESSION ---

    const totalIndent = state.ftl + state.json + state.html + state.macro;
    result.push(indentUnit.repeat(totalIndent) + t);

    // --- RÉ-INDENTATION APRÈS IMPRESSION ---

    applyPostAdjustments(t, flags);
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
