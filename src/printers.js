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

// --- Helpers FTL généraux ---
const isFtlClosingTag = (t) => /^<\/#/.test(t.trim());

const isElseLike = (t) => {
  t = t.trim();
  return /^<#else\b/.test(t) || /^<#elseif\b/.test(t) || /^<#recover\b/.test(t);
};

const isCaseLike = (t) => {
  t = t.trim();
  return /^<#case\b/.test(t) || /^<#default\b/.test(t);
};

const isFtlBlockOpener = (t) => {
  t = t.trim();

  // <#assign result> ... </#assign>
  // <#local result> ... </#local>
  // <#global result> ... </#global>
  if (
    (/^<#assign\b/.test(t) || /^<#local\b/.test(t) || /^<#global\b/.test(t)) &&
    !t.includes("=")
  ) {
    return true;
  }

  return (
    /^<#if\b/.test(t) ||
    /^<#list\b/.test(t) ||
    /^<#macro\b/.test(t) ||
    /^<#function\b/.test(t) ||
    /^<#switch\b/.test(t) ||
    /^<#attempt\b/.test(t) ||
    /^<#compress\b/.test(t) ||
    /^<#escape\b/.test(t)
  );
};

// --- Helpers HTML ---
const isHtmlOpener = (t) => {
  t = t.trim();
  if (!t.startsWith("<")) return false;

  // ignorer FTL, macros, commentaires, directives spéciales
  if (
    t.startsWith("</") ||
    t.startsWith("<#") ||
    t.startsWith("[#") ||
    t.startsWith("<@") ||
    t.startsWith("<!") ||
    t.startsWith("<?")
  ) {
    return false;
  }

  // nom de tag
  const tagMatch = t.match(/^<([A-Za-z][A-Za-z0-9-]*)/);
  const tagName = tagMatch ? tagMatch[1].toLowerCase() : null;

  // ignorer VRAIS self-closing HTML qui terminent la ligne: <br />, <input ... />
  if (/\/>\s*$/.test(t)) return false;

  // bloc inline multi-ligne : on autorise l'indentation pour que </span> tombe bien
  if (tagName && INLINE_TAGS.has(tagName)) {
    // si la fermeture est sur la même ligne, on considère que c'est inline pur → pas d'indent
    const firstGt = t.indexOf(">");
    if (firstGt !== -1) {
      const after = t.slice(firstGt + 1);
      const closeRe = new RegExp(`</${tagName}\\b`);
      if (closeRe.test(after)) {
        return false;
      }
    }
    return true;
  }

  return true;
};

// --- Helpers Macros <@...> ---
const isMacroOpener = (t) => {
  t = t.trim();
  // si la ligne se termine en "/>" on considère que c'est une macro self-closing → pas un opener
  if (/\/>/.test(t)) return false;
  if (t.includes("</@")) return false;
  return /^<@[A-Za-z_][A-Za-z0-9_.-]*/.test(t);
};

const isMacroClosing = (t) => /^<\/@[A-Za-z_][A-Za-z0-9_.-]*>/.test(t.trim());

// --- Helpers for HTML closing tags ---
const countHtmlClosingTags = (t) => {
  const closingRe = /<\/([A-Za-z][A-Za-z0-9-]*)>/g;
  let count = 0;
  while (closingRe.exec(t)) {
    count++;
  }
  return count;
};

const countLeadingHtmlClosings = (t) => {
  let count = 0;
  let rest = t.trim();
  while (true) {
    const match = rest.match(/^<\/([A-Za-z][A-Za-z0-9-]*)>\s*/);
    if (!match) break;
    count++;
    rest = rest.slice(match[0].length);
  }
  return count;
};

// --- Inline blocks FTL (ouvrant + fermant sur la même ligne) ---
const isInlineAssignBlock = (t) =>
  /<#assign\b[^>]*>.*<\/#assign>/.test(t.trim());

// bloc FTL inline générique (if, list, switch, macro, function, etc.)
const isInlineFtlBlock = (t) => {
  t = t.trim();
  return t.startsWith("<#") && t.includes("</#");
};

// --- Inline HTML block : <tag>...</tag> sur une seule ligne ---
const isInlineHtmlBlock = (t) => {
  t = t.trim();
  if (!t.startsWith("<")) return false;
  if (
    t.startsWith("</") ||
    t.startsWith("<#") ||
    t.startsWith("<@") ||
    t.startsWith("<!") ||
    t.startsWith("<?")
  ) {
    return false;
  }

  const m = t.match(/^<([A-Za-z][A-Za-z0-9-]*)(\s|>)/);
  if (!m) return false;
  const tag = m[1];
  const firstGt = t.indexOf(">");
  if (firstGt === -1) return false;
  const after = t.slice(firstGt + 1);
  const closeRe = new RegExp(`</${tag}\\b`);
  return closeRe.test(after);
};

// --- Inline macro block : <@macro ...>...</@macro> sur une ligne ---
const isInlineMacroBlock = (t) =>
  /<@[A-Za-z_][A-Za-z0-9_.-]*\b[^>]*>.*<\/@[A-Za-z_][A-Za-z0-9_.-]*>/.test(
    t.trim(),
  );

// --- Macro self-closing : <@macro ... /> (ligne qui COMMENCE par la macro) ---
const isSelfClosingMacroLine = (t) => {
  t = t.trim();
  return t.startsWith("<@") && /\/>\s*$/.test(t) && !t.includes("</@");
};

// --- Formatter FTL / HTML / JSON / Macros ---
function formatFtlText(text, options = {}) {
  const lines = text.split(/\r?\n/);
  const result = [];
  const indentUnit = options.useTabs
    ? "\t"
    : " ".repeat(typeof options.tabWidth === "number" ? options.tabWidth : 4);

  let ftlIndent = 0; // blocs FTL : <#if>, <#list>, <#switch>, <#macro>, <#function>, assign/local/global-wrap, ...
  let jsonIndent = 0; // { ... }, [ ... ]
  let htmlIndent = 0; // <div>, <ul>, <li>, <h4>, etc.
  let macroIndent = 0; // <@macro> ... </@macro> ou multi-ligne avec />

  let lastLineWasSwitchOpener = false;
  const switchCaseStack = [];
  let pendingHtmlMultiline = 0;

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
    if (
      isInlineAssignBlock(t) ||
      isInlineFtlBlock(t) ||
      isInlineHtmlBlock(t) ||
      isInlineMacroBlock(t) ||
      isSelfClosingMacroLine(t)
    ) {
      const totalIndent = ftlIndent + jsonIndent + htmlIndent + macroIndent;
      result.push(indentUnit.repeat(totalIndent) + t);
      continue;
    }

    const jsonClose = t.startsWith("}") || t.startsWith("]");
    const jsonOpen = /{\s*$/.test(t) || /\[\s*$/.test(t);
    const selfClosing = /\/>\s*$/.test(t);
    const isCaseLine = isCaseLike(t);
    const isElseLine = isElseLike(t);
    const ftlCloseLine = isFtlClosingTag(t);
    const isSwitchOpener = /^<#switch\b/.test(t);
    const isSwitchClosing = /^<\/#switch>/.test(t);

    // --- DÉSINDENTATION AVANT IMPRESSION ---

    // Clôture d'un switch : sortir du bloc case en cours si nécessaire
    if (isSwitchClosing && switchCaseStack.length > 0) {
      const hadCase = switchCaseStack.pop();
      if (hadCase && ftlIndent > 0) {
        ftlIndent--;
      }
    }

    // FTL fermant
    if (ftlCloseLine && ftlIndent > 0) {
      ftlIndent--;
    }

    // else / elseif / recover → remonter au niveau du bloc courant
    if (isElseLine && ftlIndent > 0) {
      ftlIndent--;
    }

    // case / default : on se remet juste un cran au-dessus du bloc courant, mais jamais en dessous du switch
    if (isCaseLine && ftlIndent > 0 && !lastLineWasSwitchOpener) {
      ftlIndent--;
    }

    // JSON fermant
    if (jsonClose && jsonIndent > 0) {
      jsonIndent--;
    }

    // HTML fermant
    if (leadingHtmlClosings > 0 && htmlIndent > 0) {
      const dec = Math.min(leadingHtmlClosings, htmlIndent);
      htmlIndent = Math.max(0, htmlIndent - dec);
      pendingHtmlMultiline = Math.max(0, pendingHtmlMultiline - dec);
    }

    // Macro fermante
    if (isMacroClosing(t) && macroIndent > 0) {
      macroIndent--;
    }

    // Ligne qui est juste "/>" pour fermer une macro multilignes
    if (t === "/>" && macroIndent > 0) {
      macroIndent--;
    }

    // --- IMPRESSION ---

    const totalIndent = ftlIndent + jsonIndent + htmlIndent + macroIndent;
    result.push(indentUnit.repeat(totalIndent) + t);

    // --- RÉ-INDENTATION APRÈS IMPRESSION ---

    // JSON ouvrant
    if (jsonOpen) {
      jsonIndent++;
    }

    // FTL blocs ouvrants
    if (isFtlBlockOpener(t) && !selfClosing) {
      ftlIndent++;
    }

    // FTL : else / elseif / recover / case / default ouvrent un "sous-bloc"
    if ((isElseLine || isCaseLine) && !selfClosing) {
      ftlIndent++;
    }

    // Switch : marquer la présence d'un switch ouvert
    if (isSwitchOpener && !selfClosing) {
      switchCaseStack.push(false);
    }

    // Case / default : on signale qu'un bloc case est actif
    if (isCaseLine && switchCaseStack.length > 0) {
      switchCaseStack[switchCaseStack.length - 1] = true;
    }

    // HTML ouvrant (sauf tags inline)
    if (isHtmlOpener(t)) {
      htmlIndent++;
      if (!/>\s*$/.test(t)) {
        pendingHtmlMultiline++;
      }
    }

    // Macros : <@macro ...> multi-lignes
    if (isMacroOpener(t)) {
      macroIndent++;
    }

    // HTML fermant placé après du contenu (ex: "text</p>")
    if (htmlClosingsAfterContent > 0) {
      const dec = Math.min(htmlClosingsAfterContent, htmlIndent);
      htmlIndent = Math.max(0, htmlIndent - dec);
      pendingHtmlMultiline = Math.max(0, pendingHtmlMultiline - dec);
    }

    // Fermeture d'un tag HTML multi-ligne (">" ou "/>") poursuivant la ligne d'ouverture
    if (pendingHtmlMultiline > 0 && !t.startsWith("<") && />\s*$/.test(t)) {
      pendingHtmlMultiline--;
      if (selfClosing && htmlIndent > 0) {
        htmlIndent--;
      }
    }

    lastLineWasSwitchOpener = isSwitchOpener;
  }

  return result.join("\n");
}

const printers = {
  "freemarker-ast": {
    print: (path, options) => {
      const node = path.getValue();
      const text = node && node.value ? node.value : "";
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
