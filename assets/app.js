// --- State ---
let requests = [];
let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

// --- DOM refs ---
const requestList = document.getElementById("requestList");
const emptyState = document.getElementById("emptyState");
const connectionStatus = document.getElementById("connectionStatus");
const connectionLabel = connectionStatus.querySelector(".connection-label");
const clearBtn = document.getElementById("clearBtn");
const hookUrl = document.getElementById("hookUrl");
const emptyHookUrl = document.getElementById("emptyHookUrl");
const copyUrlBtn = document.getElementById("copyUrlBtn");

// --- Init ---
const baseUrl = `${location.protocol}//${location.host}`;
const hookEndpoint = `${baseUrl}/hook/your-endpoint`;
hookUrl.textContent = hookEndpoint;
emptyHookUrl.textContent = `${location.host}/hook/...`;

copyUrlBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(hookEndpoint).then(() => {
    if (typeof __toast === "function") __toast("URL copied!");
  });
});

clearBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/clear", { method: "POST" });
    if (typeof __toast === "function") __toast("Cleared");
  } catch {
    if (typeof __toast === "function") __toast("Failed to clear", { variant: "error" });
  }
});

// --- WebSocket ---
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.addEventListener("open", () => {
    reconnectDelay = 1000;
    setConnected(true);
  });

  ws.addEventListener("close", () => {
    setConnected(false);
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    ws.close();
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "init") {
      requests = msg.requests;
      renderAll();
    } else if (msg.type === "new") {
      requests.unshift(msg.request);
      renderNew(msg.request);
    } else if (msg.type === "clear") {
      requests = [];
      renderAll();
      if (typeof __toast === "function") __toast("Cleared");
    }
  });
}

function scheduleReconnect() {
  setTimeout(() => {
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function setConnected(connected) {
  if (connected) {
    connectionStatus.classList.add("connected");
    connectionLabel.textContent = "Connected";
    connectionStatus.title = "WebSocket connected";
  } else {
    connectionStatus.classList.remove("connected");
    connectionLabel.textContent = "Disconnected";
    connectionStatus.title = "WebSocket disconnected";
  }
}

// --- Rendering ---
function renderAll() {
  requestList.innerHTML = "";
  if (requests.length === 0) {
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
    requests.forEach((req) => {
      requestList.appendChild(createCard(req, false));
    });
  }
}

function renderNew(req) {
  emptyState.classList.add("hidden");
  const card = createCard(req, true);
  requestList.prepend(card);
}

function createCard(req, flash) {
  const card = document.createElement("div");
  card.className = "request-card" + (flash ? " flash" : "");
  card.dataset.id = req.id;

  // Summary row
  const summary = document.createElement("div");
  summary.className = "request-summary";
  summary.addEventListener("click", () => {
    card.classList.toggle("expanded");
  });

  // Method badge
  const method = document.createElement("span");
  const methodLower = req.method.toLowerCase();
  const methodClass =
    ["get", "post", "put", "patch", "delete"].includes(methodLower)
      ? `method-badge--${methodLower}`
      : "method-badge--other";
  method.className = `method-badge ${methodClass}`;
  method.textContent = req.method;

  // Path
  const pathEl = document.createElement("span");
  pathEl.className = "request-path";
  const queryStr = Object.keys(req.query).length
    ? "?" + new URLSearchParams(req.query).toString()
    : "";
  pathEl.textContent = req.path + queryStr;

  // Meta
  const meta = document.createElement("span");
  meta.className = "request-meta";

  if (req.size > 0) {
    const size = document.createElement("span");
    size.className = "request-size";
    size.textContent = formatBytes(req.size);
    meta.appendChild(size);
  }

  const ip = document.createElement("span");
  ip.className = "request-ip";
  ip.textContent = req.sourceIp;
  meta.appendChild(ip);

  const time = document.createElement("span");
  time.className = "request-time";
  time.dataset.ts = req.timestamp;
  time.textContent = relativeTime(req.timestamp);
  time.title = new Date(req.timestamp).toLocaleString();
  meta.appendChild(time);

  const expandIcon = document.createElement("span");
  expandIcon.className = "expand-icon";
  expandIcon.textContent = "\u25B8"; // right-pointing triangle

  summary.append(method, pathEl, meta, expandIcon);

  // Details
  const details = document.createElement("div");
  details.className = "request-details";

  // Query params
  if (Object.keys(req.query).length > 0) {
    details.appendChild(createQuerySection(req.query));
  }

  // Headers
  details.appendChild(createHeadersSection(req.headers));

  // Body
  if (req.body !== null) {
    details.appendChild(createBodySection(req));
  }

  // Actions
  const actions = document.createElement("div");
  actions.className = "detail-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn--ghost btn--sm";
  copyBtn.textContent = "Copy as curl";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const curl = toCurl(req);
    navigator.clipboard.writeText(curl).then(() => {
      if (typeof __toast === "function") __toast("Copied!");
    });
  });
  actions.appendChild(copyBtn);

  details.appendChild(actions);

  card.append(summary, details);
  return card;
}

function createQuerySection(query) {
  const section = document.createElement("div");
  section.className = "detail-section";

  const title = document.createElement("div");
  title.className = "detail-section__title";
  title.textContent = "Query Parameters";
  section.appendChild(title);

  const table = document.createElement("table");
  table.className = "query-table";
  for (const [key, value] of Object.entries(query)) {
    const row = document.createElement("tr");
    const keyCell = document.createElement("td");
    keyCell.textContent = key;
    const valueCell = document.createElement("td");
    valueCell.textContent = value;
    row.append(keyCell, valueCell);
    table.appendChild(row);
  }
  section.appendChild(table);
  return section;
}

function createHeadersSection(headers) {
  const section = document.createElement("div");
  section.className = "detail-section";

  const title = document.createElement("div");
  title.className = "detail-section__title";
  title.textContent = "Headers";
  section.appendChild(title);

  const table = document.createElement("table");
  table.className = "headers-table";
  for (const [key, value] of Object.entries(headers)) {
    const row = document.createElement("tr");
    const keyCell = document.createElement("td");
    keyCell.textContent = key;
    const valueCell = document.createElement("td");
    valueCell.textContent = value;
    row.append(keyCell, valueCell);
    table.appendChild(row);
  }
  section.appendChild(table);
  return section;
}

function createBodySection(req) {
  const section = document.createElement("div");
  section.className = "detail-section";

  const title = document.createElement("div");
  title.className = "detail-section__title";

  const titleText = document.createElement("span");
  titleText.textContent = "Body";
  title.appendChild(titleText);

  if (req.contentType) {
    const ct = document.createElement("span");
    ct.className = "text-caption text-muted";
    ct.textContent = req.contentType;
    title.appendChild(ct);
  }

  section.appendChild(title);

  const display = document.createElement("div");
  display.className = "body-display";

  const pre = document.createElement("pre");
  const formatted = formatBody(req.body, req.contentType);
  const highlighted = highlightBody(formatted, req.contentType);
  if (highlighted) {
    pre.innerHTML = highlighted;
  } else {
    pre.textContent = formatted;
  }
  display.appendChild(pre);

  section.appendChild(display);

  if (req.bodyTruncated) {
    const note = document.createElement("div");
    note.className = "body-truncated";
    note.textContent = `Body truncated (original size: ${formatBytes(req.size)})`;
    section.appendChild(note);
  }

  return section;
}

// --- Formatting ---
function formatBody(body, contentType) {
  if (!body) return "";

  if (contentType && contentType.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }

  if (contentType && contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(body);
      return Array.from(params.entries())
        .map(([k, v]) => `${k} = ${v}`)
        .join("\n");
    } catch {
      return body;
    }
  }

  return body;
}

// --- Syntax highlighting ---
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function highlightJSON(jsonStr) {
  let result = "";
  let i = 0;
  const len = jsonStr.length;

  while (i < len) {
    const ch = jsonStr[i];

    if (ch === '"') {
      // Consume the full string (handles escaped characters)
      let end = i + 1;
      while (end < len) {
        if (jsonStr[end] === "\\") { end += 2; continue; }
        if (jsonStr[end] === '"') { end++; break; }
        end++;
      }
      const raw = jsonStr.slice(i, end);

      // Determine if this string is an object key (followed by ':')
      let peek = end;
      while (peek < len && (jsonStr[peek] === " " || jsonStr[peek] === "\n" || jsonStr[peek] === "\r" || jsonStr[peek] === "\t")) peek++;
      const cls = jsonStr[peek] === ":" ? "syn-key" : "syn-str";

      result += `<span class="${cls}">${escapeHtml(raw)}</span>`;
      i = end;
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      // Number
      let end = i + 1;
      while (end < len && /[\deE.+\-]/.test(jsonStr[end])) end++;
      result += `<span class="syn-num">${jsonStr.slice(i, end)}</span>`;
      i = end;
    } else if (jsonStr.slice(i, i + 4) === "true") {
      result += '<span class="syn-bool">true</span>';
      i += 4;
    } else if (jsonStr.slice(i, i + 5) === "false") {
      result += '<span class="syn-bool">false</span>';
      i += 5;
    } else if (jsonStr.slice(i, i + 4) === "null") {
      result += '<span class="syn-null">null</span>';
      i += 4;
    } else if (ch === "{" || ch === "}" || ch === "[" || ch === "]") {
      result += `<span class="syn-bracket">${ch}</span>`;
      i++;
    } else {
      // Whitespace, colons, commas — pass through escaped
      result += escapeHtml(ch);
      i++;
    }
  }

  return result;
}

function highlightXML(xmlStr) {
  let result = "";
  let i = 0;
  const len = xmlStr.length;

  while (i < len) {
    if (xmlStr[i] === "<") {
      // Comment
      if (xmlStr.slice(i, i + 4) === "<!--") {
        const end = xmlStr.indexOf("-->", i + 4);
        const close = end === -1 ? len : end + 3;
        result += `<span class="syn-comment">${escapeHtml(xmlStr.slice(i, close))}</span>`;
        i = close;
        continue;
      }

      // CDATA
      if (xmlStr.slice(i, i + 9) === "<![CDATA[") {
        const end = xmlStr.indexOf("]]>", i + 9);
        const close = end === -1 ? len : end + 3;
        result += `<span class="syn-str">${escapeHtml(xmlStr.slice(i, close))}</span>`;
        i = close;
        continue;
      }

      // Tag (opening, closing, or self-closing)
      const tagEnd = xmlStr.indexOf(">", i);
      if (tagEnd === -1) {
        result += escapeHtml(xmlStr.slice(i));
        break;
      }
      const tagContent = xmlStr.slice(i, tagEnd + 1);
      result += highlightXMLTag(tagContent);
      i = tagEnd + 1;
    } else {
      // Text content between tags
      let end = xmlStr.indexOf("<", i);
      if (end === -1) end = len;
      result += escapeHtml(xmlStr.slice(i, end));
      i = end;
    }
  }

  return result;
}

function highlightXMLTag(tag) {
  // Match: < optional / , tag name, attributes, optional / , >
  const m = tag.match(/^(<\/?)(\S+?)((?:\s+[^>]*?)?)(\s*\/?>)$/s);
  if (!m) return escapeHtml(tag);

  const [, open, name, attrs, close] = m;
  let result = `<span class="syn-bracket">${escapeHtml(open)}</span>`;
  result += `<span class="syn-tag">${escapeHtml(name)}</span>`;

  // Highlight attributes: name="value" or name='value'
  if (attrs) {
    const highlighted = attrs.replace(/([a-zA-Z_:][\w:.-]*)(\s*=\s*)(["'])(.*?)\3/g, (_, aName, eq, q, aVal) => {
      return `<span class="syn-attr">${escapeHtml(aName)}</span>${escapeHtml(eq)}<span class="syn-str">${escapeHtml(q + aVal + q)}</span>`;
    });
    result += highlighted;
  }

  result += `<span class="syn-bracket">${escapeHtml(close)}</span>`;
  return result;
}

function highlightBody(formatted, contentType) {
  if (!formatted) return null;

  if (contentType && contentType.includes("application/json")) {
    try {
      // Verify it's valid JSON (formatBody already pretty-printed it)
      JSON.parse(formatted);
      return highlightJSON(formatted);
    } catch {
      return null;
    }
  }

  if (contentType && (contentType.includes("text/xml") || contentType.includes("application/xml") || contentType.includes("+xml"))) {
    return highlightXML(formatted);
  }

  if (contentType && (contentType.includes("text/html") || contentType.includes("application/xhtml"))) {
    return highlightXML(formatted);
  }

  return null;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function toCurl(req) {
  const parts = [`curl -X ${req.method}`];
  const url = `${baseUrl}${req.path}`;
  const queryStr = Object.keys(req.query).length
    ? "?" + new URLSearchParams(req.query).toString()
    : "";

  for (const [key, value] of Object.entries(req.headers)) {
    // Skip internal/proxy headers
    if (
      key.startsWith("cf-") ||
      key.startsWith("x-forwarded") ||
      key === "host" ||
      key === "connection" ||
      key === "content-length"
    )
      continue;
    parts.push(`-H '${key}: ${value}'`);
  }

  if (req.body) {
    parts.push(`-d '${req.body.replace(/'/g, "'\\''")}'`);
  }

  parts.push(`'${url}${queryStr}'`);
  return parts.join(" \\\n  ");
}

// --- Timestamp updater ---
setInterval(() => {
  document.querySelectorAll(".request-time[data-ts]").forEach((el) => {
    el.textContent = relativeTime(el.dataset.ts);
  });
}, 10000);

// --- Start ---
connect();
