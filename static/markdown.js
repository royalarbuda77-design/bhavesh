/**
 * A small, dependency-free markdown renderer.
 *
 * Supports: headings, bold/italic/strikethrough, inline code, fenced and
 * indented code blocks, links, images, blockquotes, ordered/unordered lists,
 * task lists, tables and horizontal rules. All output is escaped first, so
 * raw HTML in a note is shown as text rather than injected into the page.
 */
(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(url) {
    const trimmed = String(url).trim();
    if (/^(https?:|mailto:|#|\/|\.)/i.test(trimmed)) return trimmed;
    return "#";
  }

  /** Inline-level formatting, applied to already-escaped text. */
  function inline(text) {
    const codes = [];
    // Stash inline code first so its contents are never re-formatted.
    let out = text.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000CODE${codes.length - 1}\u0000`;
    });

    // Images before links, since the syntax overlaps.
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      (_, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy">`);

    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      (_, label, href) =>
        `<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);

    // Bare autolinks.
    out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
      (_, pre, url) =>
        `${pre}<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    out = out.replace(/ {2,}$/gm, "<br>");

    return out.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function renderTable(rows) {
    const cells = (line) =>
      line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

    const header = cells(rows[0]);
    const aligns = cells(rows[1]).map((spec) => {
      const left = spec.startsWith(":");
      const right = spec.endsWith(":");
      if (left && right) return " style=\"text-align:center\"";
      if (right) return " style=\"text-align:right\"";
      return "";
    });

    let html = "<table><thead><tr>";
    header.forEach((cell, i) => {
      html += `<th${aligns[i] || ""}>${inline(cell)}</th>`;
    });
    html += "</tr></thead><tbody>";

    for (let i = 2; i < rows.length; i++) {
      html += "<tr>";
      cells(rows[i]).forEach((cell, j) => {
        html += `<td${aligns[j] || ""}>${inline(cell)}</td>`;
      });
      html += "</tr>";
    }
    return html + "</tbody></table>";
  }

  function render(markdown) {
    if (!markdown || !markdown.trim()) return "";

    const lines = escapeHtml(markdown).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let i = 0;

    const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
    const isDivider = (line) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block.
      const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/);
      if (fence) {
        const marker = fence[1][0];
        const lang = fence[2];
        const body = [];
        i++;
        while (i < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[i])) {
          body.push(lines[i]);
          i++;
        }
        i++; // closing fence
        const cls = lang ? ` class="language-${lang}"` : "";
        html.push(`<pre><code${cls}>${body.join("\n")}</code></pre>`);
        continue;
      }

      // Blank line.
      if (!line.trim()) {
        i++;
        continue;
      }

      // Horizontal rule.
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        html.push("<hr>");
        i++;
        continue;
      }

      // Heading.
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      // Table.
      if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(lines[i]);
          i++;
        }
        html.push(renderTable(rows));
        continue;
      }

      // Blockquote — note lines are already escaped, so match &gt;.
      if (/^\s{0,3}&gt;/.test(line)) {
        const body = [];
        while (i < lines.length && /^\s{0,3}&gt;/.test(lines[i])) {
          body.push(lines[i].replace(/^\s{0,3}&gt;\s?/, ""));
          i++;
        }
        html.push(`<blockquote>${render(unescapeForNested(body.join("\n")))}</blockquote>`);
        continue;
      }

      // Lists (ordered, unordered and task items).
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          let text = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "");
          // Continuation lines belonging to this item.
          i++;
          while (
            i < lines.length &&
            lines[i].trim() &&
            !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
            !/^\s{0,3}(#{1,6}\s|&gt;)/.test(lines[i])
          ) {
            text += " " + lines[i].trim();
            i++;
          }

          const task = text.match(/^\[([ xX])\]\s+(.*)$/);
          if (task) {
            const checked = task[1].toLowerCase() === "x" ? " checked" : "";
            items.push(
              `<li class="task"><input type="checkbox" disabled${checked}> ${inline(task[2])}</li>`
            );
          } else {
            items.push(`<li>${inline(text)}</li>`);
          }
        }
        const tag = ordered ? "ol" : "ul";
        html.push(`<${tag}>${items.join("")}</${tag}>`);
        continue;
      }

      // Indented code block.
      if (/^(\t| {4})/.test(line)) {
        const body = [];
        while (i < lines.length && (/^(\t| {4})/.test(lines[i]) || !lines[i].trim())) {
          if (!lines[i].trim() && !(lines[i + 1] && /^(\t| {4})/.test(lines[i + 1]))) break;
          body.push(lines[i].replace(/^(\t| {4})/, ""));
          i++;
        }
        html.push(`<pre><code>${body.join("\n")}</code></pre>`);
        continue;
      }

      // Paragraph.
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^\s{0,3}(#{1,6}\s|&gt;|([-*+]|\d+[.)])\s)/.test(lines[i]) &&
        !/^\s*(`{3,}|~{3,})/.test(lines[i]) &&
        !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      if (para.length) html.push(`<p>${inline(para.join("\n"))}</p>`);
      else i++;
    }

    return html.join("\n");
  }

  // Blockquote bodies are already escaped; undo it before the nested render
  // call re-escapes them.
  function unescapeForNested(str) {
    return str
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  global.Markdown = { render, escapeHtml };
})(window);
