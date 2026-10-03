/* MQTT Mindmap Dashboard – Frontend
 * Baut aus den vom Server per SocketIO gelieferten Topic-Knoten
 * (getrennt an "/") eine wachsende, RADIALE D3-Mindmap: die Zweige
 * breiten sich in alle Richtungen vom Broker-Knoten (Wurzel, Mitte)
 * aus. Jeder Hauptzweig (1. Ebene) bekommt eine eigene Farbe, die an
 * alle Unterknoten des Zweigs vererbt wird. Bei jeder neuen Nachricht
 * wandert ein Marker vom betroffenen Topic-Knoten den Ast entlang zum
 * Broker-Knoten.
 */
(() => {
  "use strict";

  const ROOT_ID = "__root__";
  const RING = 130;        // Radius-Zuwachs pro Baumebene
  const MIN_RADIUS = 220;  // minimaler Gesamtradius, auch bei wenig Tiefe
  const ROOT_COLOR = "#4fd1c5";

  const socket = io();

  // ---- Zustand -----------------------------------------------------
  const nodesById = new Map();          // id -> Rohdaten vom Server
  let layoutPositions = new Map();      // id -> {x, y} (kartesisch) nach letztem Render
  let selectedNodeId = null;
  let searchTerm = "";
  let logCount = 0;
  let branchColorScale = d3.scaleOrdinal();

  // ---- SVG / Zoom Setup ---------------------------------------------
  const svg = d3.select("#graph");
  const zoomLayer = svg.append("g").attr("class", "zoom-layer");
  const linkLayer = zoomLayer.append("g").attr("class", "links");
  const nodeLayer = zoomLayer.append("g").attr("class", "nodes");
  const markerLayer = zoomLayer.append("g").attr("class", "markers");

  const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => zoomLayer.attr("transform", event.transform));
  svg.call(zoom);

  function graphSize() {
    const wrap = document.getElementById("graph-wrap");
    return { w: wrap.clientWidth, h: wrap.clientHeight };
  }

  // Wurzel (Broker) mittig platzieren, Zweige strahlen rundherum aus
  function initialTransform() {
    const { w, h } = graphSize();
    return d3.zoomIdentity.translate(w / 2, h / 2);
  }
  svg.call(zoom.transform, initialTransform());

  // ---- Farben pro Hauptzweig -------------------------------------------
  function updateBranchColorScale() {
    const topLevelIds = [];
    for (const n of nodesById.values()) {
      if (n.parent_id === ROOT_ID) topLevelIds.push(n.id);
    }
    const count = Math.max(topLevelIds.length, 3);
    const colors = d3.quantize((t) => d3.interpolateRainbow(t * 0.92 + 0.02), count);
    branchColorScale = d3.scaleOrdinal(colors).domain(topLevelIds);
  }

  function branchKeyOf(id) {
    let node = nodesById.get(id);
    if (!node || node.parent_id === null) return null; // Wurzel selbst
    while (node.parent_id !== ROOT_ID) {
      const parent = nodesById.get(node.parent_id);
      if (!parent) break;
      node = parent;
    }
    return node.id;
  }

  function colorFor(id, depth) {
    if (id === ROOT_ID) return ROOT_COLOR;
    const key = branchKeyOf(id);
    const base = d3.color(branchColorScale(key));
    if (!base) return ROOT_COLOR;
    const extraDepth = Math.max(0, (depth || 1) - 1);
    return base.brighter(Math.min(extraDepth, 4) * 0.16).formatHex();
  }

  // ---- Radiales Baum-Layout ---------------------------------------------
  function render() {
    const values = Array.from(nodesById.values());
    if (values.length === 0) return;

    updateBranchColorScale();

    let root;
    try {
      root = d3.stratify()
        .id((d) => d.id)
        .parentId((d) => d.parent_id)(values);
    } catch (e) {
      // kann kurzzeitig passieren, falls ein Kind vor dem Elternteil ankommt
      return;
    }

    const maxDepth = Math.max(root.height, 1);
    const radius = Math.max(MIN_RADIUS, maxDepth * RING);

    const treeLayout = d3.tree()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);
    treeLayout(root);

    const hNodes = root.descendants();
    const hLinks = root.links();

    layoutPositions = new Map();
    hNodes.forEach((n) => {
      const [px, py] = d3.pointRadial(n.x, n.y);
      layoutPositions.set(n.id, { x: px, y: py });
    });

    // ---- Astdicke: je mehr Sub-Topics an einem Knoten hängen, desto
    // dicker wird der zu ihm führende Ast dargestellt --------------------
    const subtreeSize = new Map(); // id -> Anzahl Knoten im eigenen Teilbaum (inkl. sich selbst)
    [...hNodes].sort((a, b) => b.depth - a.depth).forEach((n) => {
      let size = 1;
      if (n.children) {
        for (const c of n.children) size += subtreeSize.get(c.id) || 1;
      }
      subtreeSize.set(n.id, size);
    });
    const branchWeight = (id) => Math.max(0, (subtreeSize.get(id) || 1) - 1);
    const maxWeight = Math.max(1, ...hNodes.map((n) => branchWeight(n.id)));
    const widthScale = d3.scaleSqrt().domain([0, maxWeight]).range([1.6, 10]).clamp(true);

    // ---- Links (strahlenförmig von der Wurzel weg) ----
    const linkGen = d3.linkRadial().angle((d) => d.x).radius((d) => d.y);

    linkLayer.selectAll("path.link")
      .data(hLinks, (d) => d.target.id)
      .join(
        (enter) => enter.append("path")
          .attr("class", "link")
          .style("stroke", (d) => colorFor(d.target.id, d.target.depth))
          .style("stroke-width", (d) => `${widthScale(branchWeight(d.target.id))}px`)
          .attr("d", (d) => {
            const o = { x: d.source.x, y: d.source.y };
            return linkGen({ source: o, target: o });
          })
          .call((enter) => enter.transition().duration(400).attr("d", linkGen)),
        (update) => update
          .style("stroke", (d) => colorFor(d.target.id, d.target.depth))
          .style("stroke-width", (d) => `${widthScale(branchWeight(d.target.id))}px`)
          .call((u) => u.transition().duration(400).attr("d", linkGen)),
        (exit) => exit.remove()
      );

    // ---- Knoten ----
    const nodeSel = nodeLayer.selectAll("g.node")
      .data(hNodes, (d) => d.id);

    const nodeEnter = nodeSel.enter().append("g")
      .attr("class", (d) => "node" + (d.data.is_root ? " root" : ""))
      .attr("transform", (d) => {
        const src = d.parent || d;
        const [px, py] = d3.pointRadial(src.x, src.y);
        return `translate(${px},${py})`;
      })
      .style("cursor", "pointer")
      .on("click", (event, d) => selectNode(d.id));

    nodeEnter.append("circle").attr("r", (d) => (d.data.is_root ? 10 : 6));
    nodeEnter.append("text").attr("dy", "0.32em");

    const merged = nodeEnter.merge(nodeSel);

    merged
      .attr("class", (d) => {
        const cls = ["node"];
        if (d.data.is_root) cls.push("root");
        if (d.id === selectedNodeId) cls.push("selected");
        if (searchTerm && matchesSearch(d)) cls.push("highlight");
        else if (searchTerm) cls.push("dim");
        return cls.join(" ");
      })
      .transition().duration(400)
      .attr("transform", (d) => {
        const [px, py] = d3.pointRadial(d.x, d.y);
        return `translate(${px},${py})`;
      });

    merged.select("circle")
      .style("fill", (d) => colorFor(d.id, d.depth));

    merged.select("text")
      .attr("x", (d) => (layoutPositions.get(d.id).x >= 0 ? 10 : -10))
      .attr("text-anchor", (d) => (layoutPositions.get(d.id).x >= 0 ? "start" : "end"))
      .text((d) => d.data.name);

    nodeSel.exit().remove();

    document.getElementById("node-count").textContent = Math.max(hNodes.length - 1, 0);
  }

  function matchesSearch(d) {
    return d.id.toLowerCase().includes(searchTerm) || d.data.name.toLowerCase().includes(searchTerm);
  }

  // ---- Marker-Animation (Nachricht wandert zum Broker) ----------------
  function animateMessage(pathIds) {
    // pathIds kommt vom Server als [ROOT, ..., leaf] -> für die Animation
    // Richtung "zum Broker" umdrehen: leaf -> ... -> ROOT
    const points = [...pathIds].reverse()
      .map((id) => layoutPositions.get(id))
      .filter(Boolean);
    if (points.length < 2) {
      pulseNode(pathIds[pathIds.length - 1]);
      return;
    }

    const marker = markerLayer.append("circle")
      .attr("class", "marker")
      .attr("r", 5)
      .attr("cx", points[0].x)
      .attr("cy", points[0].y);

    pulseNode(pathIds[pathIds.length - 1]);

    let chain = marker.transition().duration(0);
    for (let i = 1; i < points.length; i++) {
      const dist = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      const duration = Math.max(120, Math.min(500, dist * 1.1));
      chain = chain.transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attr("cx", points[i].x)
        .attr("cy", points[i].y);
    }
    chain.on("end", () => {
      pulseNode(ROOT_ID);
      marker.transition().duration(180).attr("r", 0).remove();
    });
  }

  function pulseNode(id) {
    nodeLayer.selectAll("g.node")
      .filter((d) => d.id === id)
      .classed("pulse", false)
      .each(function () { void this.offsetWidth; }) // reflow, damit die Animation neu startet
      .classed("pulse", true);
  }

  // ---- Auswahl & Detailanzeige ----------------------------------------
  function selectNode(id) {
    selectedNodeId = id;
    render();
    const data = nodesById.get(id);
    const box = document.getElementById("detail-box");
    if (!data || (!data.last_topic && data.is_root)) {
      box.classList.add("empty");
      box.innerHTML = "<h2>Details</h2><p class='hint'>Für diesen Knoten liegt noch keine Nachricht vor.</p>";
      return;
    }
    box.classList.remove("empty");
    const ts = data.last_ts ? new Date(data.last_ts * 1000).toLocaleTimeString("de-DE") : "–";
    const payloadText = data.last_payload ? data.last_payload.text : "(keine Nutzlast)";
    box.innerHTML = `
      <h2>Details</h2>
      <div class="detail-topic">${escapeHtml(data.last_topic || data.id)}</div>
      <div class="detail-meta">
        <span>QoS: <b>${data.last_qos ?? "–"}</b></span>
        <span>Retain: <b>${data.last_retain ? "ja" : "nein"}</b></span>
        <span>Nachrichten: <b>${data.msg_count}</b></span>
        <span>Zuletzt: <b>${ts}</b></span>
      </div>
      <pre class="payload">${escapeHtml(payloadText)}</pre>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Nachrichtenverlauf ----------------------------------------------
  function addLogEntry(msg) {
    const list = document.getElementById("log-list");
    const li = document.createElement("li");
    const time = new Date(msg.ts * 1000).toLocaleTimeString("de-DE");
    li.innerHTML = `<span class="topic">${escapeHtml(msg.topic)}</span><span class="meta">${time} · QoS ${msg.qos}${msg.retain ? " · retained" : ""}</span>`;
    li.addEventListener("click", () => selectNode(msg.path[msg.path.length - 1]));
    list.prepend(li);
    logCount++;
    while (list.children.length > 200) list.removeChild(list.lastChild);
    document.getElementById("msg-total").textContent = logCount;
  }

  // ---- SocketIO Events ---------------------------------------------------
  socket.on("tree_snapshot", (data) => {
    nodesById.clear();
    (data.nodes || []).forEach((n) => nodesById.set(n.id, n));
    document.getElementById("log-list").innerHTML = "";
    logCount = 0;
    document.getElementById("msg-total").textContent = 0;
    render();
  });

  socket.on("node_added", (node) => {
    nodesById.set(node.id, node);
    render();
  });

  socket.on("message", (msg) => {
    const leafId = msg.path[msg.path.length - 1];
    const node = nodesById.get(leafId);
    if (node) {
      node.msg_count = msg.msg_count;
      node.last_topic = msg.topic;
      node.last_payload = msg.payload;
      node.last_qos = msg.qos;
      node.last_retain = msg.retain;
      node.last_ts = msg.ts;
    }
    const rootNode = nodesById.get(ROOT_ID);
    if (rootNode) rootNode.msg_count = (rootNode.msg_count || 0) + 1;

    animateMessage(msg.path);
    addLogEntry(msg);
    if (selectedNodeId === leafId) selectNode(leafId);
  });

  socket.on("status", (status) => setStatus(status));

  // ---- Verbindungs-UI --------------------------------------------------
  let mqttConnected = false; // für die Broker-Einfärbung in der Ring-Ansicht

  function setStatus(status) {
    mqttConnected = !!status.connected;
    const pill = document.getElementById("status-pill");
    const text = document.getElementById("status-text");
    const connectBtn = document.getElementById("connect-btn");
    const disconnectBtn = document.getElementById("disconnect-btn");

    pill.classList.remove("online", "offline", "connecting");
    if (status.connected) {
      pill.classList.add("online");
      const b = status.broker || {};
      text.textContent = `Verbunden: ${b.host}:${b.port}`;
      connectBtn.hidden = true;
      disconnectBtn.hidden = false;
    } else if (status.connecting) {
      pill.classList.add("connecting");
      text.textContent = "Verbinde…";
      connectBtn.hidden = true;
      disconnectBtn.hidden = false;
    } else {
      pill.classList.add("offline");
      text.textContent = status.error ? `Fehler: ${status.error}` : "Nicht verbunden";
      connectBtn.hidden = false;
      disconnectBtn.hidden = true;
    }
  }

  document.getElementById("connect-form").addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("connect_broker", {
      host: document.getElementById("host").value,
      port: document.getElementById("port").value,
      topic_filter: document.getElementById("topic_filter").value,
      username: document.getElementById("username").value,
      password: document.getElementById("password").value,
      client_id: document.getElementById("client_id").value,
      use_tls: document.getElementById("use_tls").checked,
    });
  });

  document.getElementById("disconnect-btn").addEventListener("click", () => {
    socket.emit("disconnect_broker");
  });

  document.getElementById("reset-tree-btn").addEventListener("click", () => {
    socket.emit("reset_tree");
    selectedNodeId = null;
  });

  document.getElementById("toggle-advanced").addEventListener("click", () => {
    const panel = document.getElementById("advanced-panel");
    panel.hidden = !panel.hidden;
  });

  document.getElementById("clear-log-btn").addEventListener("click", () => {
    document.getElementById("log-list").innerHTML = "";
  });

  document.getElementById("search-box").addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById("fit-btn").addEventListener("click", () => {
    if (currentView === "mindmap") fitToScreen();
  });

  function fitToScreen() {
    const positions = Array.from(layoutPositions.values());
    if (positions.length === 0) return;
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
    const { w, h } = graphSize();
    const scale = Math.max(0.15, Math.min(2, 0.9 / Math.max((maxX - minX) / w, (maxY - minY) / h)));
    const tx = w / 2 - scale * (minX + maxX) / 2;
    const ty = h / 2 - scale * (minY + maxY) / 2;
    svg.transition().duration(400)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  window.addEventListener("resize", () => {
    if (currentView === "mindmap") render();
  });

  // =====================================================================
  // Ring-Ansicht (Canvas) – 1:1 nachgebauter Darstellungsaufbau aus dem
  // Vorbild MQTT-Monitor-Dashboard-MK1 (app.py, Funktion draw()):
  //   - Broker als gefüllter Kreis (r=26) in der Mitte, Füllung/Rahmen
  //     amber wenn verbunden, rot wenn nicht.
  //   - ein INNERER Ring bei 0.28*min(w,h) ("Client-Ring" im Vorbild)
  //   - ein ÄUSSERER Ring bei 0.46*min(w,h), Winkel-Offset +0,15 rad
  //     ("Topic-Ring" im Vorbild)
  //   - Kanten NUR Broker<->Innenring (immer, dezentes Türkis) und
  //     Innenring<->Außenring (nur bei tatsächlichem Bezug), NICHT
  //     direkt Broker<->Außenring.
  //   - Bei einer Nachricht flammen Kante + beide beteiligten Knoten
  //     kurz amberfarben auf (Broker bleibt dabei unverändert, genau
  //     wie im Vorbild).
  //
  // Das Vorbild zeigt im Innenring die MQTT-CLIENTS (es betreibt einen
  // eigenen, eingebetteten Broker und kennt daher jeden Client) und im
  // Außenring die Topics, auf die diese Clients publizieren/abonnieren.
  // Dieses Programm hier verbindet sich dagegen nur als gewöhnlicher
  // Abonnent mit einem beliebigen EXTERNEN Broker – dabei ist laut
  // MQTT-Protokoll nicht sichtbar, welcher Client eine Nachricht
  // veröffentlicht hat, es gibt also keine Client-Liste. Um trotzdem
  // denselben zweistufigen Diagrammaufbau (Broker → Zwischenebene →
  // Topic) zu erhalten, übernimmt der Innenring hier die obersten
  // Themenzweige (1. Pfadebene, z.B. "home", "factory") an genau der
  // Stelle, an der im Vorbild die Clients sitzen; der Außenring zeigt
  // wie im Vorbild die einzelnen Topics (Blätter des Themenbaums).
  // =====================================================================

  let currentView = "mindmap";
  const ringCanvas = document.getElementById("ring-canvas");
  const ringCtx = ringCanvas.getContext("2d");
  const ringFlashes = []; // { id, ts } – id ist eine Topic- oder Zweig-Node-ID
  let ringAnimHandle = null;
  let ringClickTargets = [];

  function ringLeafTopics() {
    const hasChildren = new Set();
    for (const n of nodesById.values()) {
      if (n.parent_id) hasChildren.add(n.parent_id);
    }
    const leaves = [];
    for (const n of nodesById.values()) {
      if (n.id === ROOT_ID) continue;
      if (!hasChildren.has(n.id)) leaves.push(n);
    }
    leaves.sort((a, b) => a.id.localeCompare(b.id));
    return leaves;
  }

  function ringBranchNodes() {
    const branches = [];
    for (const n of nodesById.values()) {
      if (n.parent_id === ROOT_ID) branches.push(n);
    }
    branches.sort((a, b) => a.id.localeCompare(b.id));
    return branches;
  }

  function resizeRingCanvas() {
    const wrap = document.getElementById("graph-wrap");
    ringCanvas.width = wrap.clientWidth;
    ringCanvas.height = wrap.clientHeight;
  }

  function truncateLabel(label, max) {
    return label.length > max ? label.slice(0, max - 2) + "…" : label;
  }

  function drawRing() {
    resizeRingCanvas();
    const w = ringCanvas.width, h = ringCanvas.height;
    const cx = w / 2, cy = h / 2;
    // Radien/Winkel-Offset exakt wie im Vorbild (rClient / rTopic)
    const rBranch = Math.min(w, h) * 0.28;
    const rTopic = Math.min(w, h) * 0.46;
    ringCtx.clearRect(0, 0, w, h);

    const branches = ringBranchNodes();
    const topics = ringLeafTopics();
    const now = performance.now();

    while (ringFlashes.length && now - ringFlashes[0].ts > 900) ringFlashes.shift();
    const flashAge = new Map();
    for (const f of ringFlashes) {
      const age = now - f.ts;
      if (!flashAge.has(f.id) || flashAge.get(f.id) > age) flashAge.set(f.id, age);
    }
    const flashOf = (id) => {
      const age = flashAge.get(id);
      return age !== undefined ? Math.max(0, 1 - age / 900) : 0;
    };

    const branchPos = new Map();
    branches.forEach((b, i) => {
      const a = (i / Math.max(branches.length, 1)) * 2 * Math.PI - Math.PI / 2;
      branchPos.set(b.id, { x: cx + Math.cos(a) * rBranch, y: cy + Math.sin(a) * rBranch });
    });
    const topicPos = new Map();
    topics.forEach((t, i) => {
      const a = (i / Math.max(topics.length, 1)) * 2 * Math.PI - Math.PI / 2 + 0.15;
      topicPos.set(t.id, { x: cx + Math.cos(a) * rTopic, y: cy + Math.sin(a) * rTopic });
    });

    // ---- Kanten: Broker <-> Zweig (immer sichtbar, dezentes Türkis) ----
    ringCtx.lineWidth = 1;
    branches.forEach((b) => {
      const p = branchPos.get(b.id);
      ringCtx.strokeStyle = "rgba(45,212,191,0.25)";
      ringCtx.beginPath();
      ringCtx.moveTo(cx, cy);
      ringCtx.lineTo(p.x, p.y);
      ringCtx.stroke();
    });

    // ---- Kanten: Zweig <-> Topic (nur bei tatsächlicher Zugehörigkeit) ----
    topics.forEach((t) => {
      const tp = topicPos.get(t.id);
      const branchId = branchKeyOf(t.id);
      const bp = branchPos.get(branchId);
      if (!bp) return;
      const flash = flashOf(t.id);
      ringCtx.strokeStyle = flash > 0 ? `rgba(255,176,32,${0.35 + 0.6 * flash})` : "rgba(45,212,191,0.15)";
      ringCtx.lineWidth = flash > 0 ? 1.5 + 2.5 * flash : 1;
      ringCtx.beginPath();
      ringCtx.moveTo(bp.x, bp.y);
      ringCtx.lineTo(tp.x, tp.y);
      ringCtx.stroke();
    });

    // ---- Broker-Knoten (Mitte) – Farbe nach Verbindungsstatus, kein
    // Nachrichten-Flash (genau wie im Vorbild) ----
    ringCtx.beginPath();
    ringCtx.arc(cx, cy, 26, 0, 2 * Math.PI);
    ringCtx.fillStyle = mqttConnected ? "rgba(255,176,32,0.18)" : "rgba(255,93,93,0.15)";
    ringCtx.fill();
    ringCtx.lineWidth = 2;
    ringCtx.strokeStyle = mqttConnected ? "#ffb020" : "#ff5d5d";
    ringCtx.stroke();
    ringCtx.fillStyle = "#ffb020";
    ringCtx.font = "10px Consolas, monospace";
    ringCtx.textAlign = "center";
    ringCtx.textBaseline = "middle";
    ringCtx.fillText("BROKER", cx, cy);

    // ---- Zweig-Knoten (Innenring, an Stelle der Clients im Vorbild) ----
    branches.forEach((b) => {
      const p = branchPos.get(b.id);
      const flash = flashOf(b.id);
      const r = 12 + 4 * flash;
      ringCtx.beginPath();
      ringCtx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ringCtx.fillStyle = flash > 0 ? `rgba(255,176,32,${0.3 + 0.4 * flash})` : "rgba(45,212,191,0.15)";
      ringCtx.fill();
      ringCtx.lineWidth = 1.5;
      ringCtx.strokeStyle = flash > 0 ? "#ffb020" : "#2dd4bf";
      ringCtx.stroke();
      ringCtx.fillStyle = "#dfe8ea";
      ringCtx.font = "9px Consolas, monospace";
      ringCtx.textAlign = "center";
      ringCtx.textBaseline = "top";
      ringCtx.fillText(truncateLabel(b.name || b.id, 14), p.x, p.y + r + 3);
    });

    // ---- Topic-Knoten (Außenring) ----
    topics.forEach((t) => {
      const p = topicPos.get(t.id);
      const flash = flashOf(t.id);
      const r = 6 + Math.min(10, Math.log2((t.msg_count || 0) + 1)) + 3 * flash;
      ringCtx.beginPath();
      ringCtx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ringCtx.fillStyle = flash > 0 ? `rgba(255,176,32,${0.35 + 0.5 * flash})` : "rgba(255,255,255,0.06)";
      ringCtx.fill();
      ringCtx.lineWidth = t.id === selectedNodeId ? 2 : 1;
      ringCtx.strokeStyle = t.id === selectedNodeId ? "#ffffff" : (flash > 0 ? "#ffb020" : "#5a6f77");
      ringCtx.stroke();
      ringCtx.fillStyle = "#8fa3aa";
      ringCtx.font = "9px Consolas, monospace";
      ringCtx.textAlign = "center";
      ringCtx.textBaseline = "top";
      ringCtx.fillText(truncateLabel(t.name || t.id, 18), p.x, p.y + r + 3);
    });

    ringClickTargets = [
      ...branches.map((b) => ({ id: b.id, x: branchPos.get(b.id).x, y: branchPos.get(b.id).y, r: 16 })),
      ...topics.map((t) => ({ id: t.id, x: topicPos.get(t.id).x, y: topicPos.get(t.id).y, r: 14 })),
    ];
  }

  ringCanvas.addEventListener("click", (event) => {
    const rect = ringCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    for (const t of ringClickTargets) {
      if (Math.hypot(t.x - x, t.y - y) <= t.r) {
        selectNode(t.id);
        break;
      }
    }
  });

  function ringLoop() {
    if (currentView !== "ring") return;
    drawRing();
    ringAnimHandle = requestAnimationFrame(ringLoop);
  }

  function switchView(view) {
    if (view === currentView) return;
    currentView = view;
    // Hinweis: <svg>-Elemente spiegeln die .hidden-Property nicht
    // zuverlässig auf das HTML-Attribut zurück (anders als bei
    // gewöhnlichen HTML-Elementen), daher hier explizit über eine
    // CSS-Klasse steuern statt über .hidden/[hidden].
    document.getElementById("graph").classList.toggle("view-hidden", view !== "mindmap");
    ringCanvas.classList.toggle("view-hidden", view !== "ring");
    document.getElementById("btn-view-mindmap").classList.toggle("active", view === "mindmap");
    document.getElementById("btn-view-ring").classList.toggle("active", view === "ring");
    if (ringAnimHandle) cancelAnimationFrame(ringAnimHandle);
    if (view === "mindmap") {
      render();
    } else {
      ringLoop();
    }
  }

  document.getElementById("btn-view-mindmap").addEventListener("click", () => switchView("mindmap"));
  document.getElementById("btn-view-ring").addEventListener("click", () => switchView("ring"));
  document.getElementById("btn-view-mindmap").classList.add("active");

  // Jede Nachricht auch als Ring-Flash vormerken (unabhängig von der
  // aktuell sichtbaren Ansicht, damit ein Wechsel keine Nachrichten verpasst).
  // Geflasht werden das betroffene Topic und sein Zweig-Knoten – der Broker
  // selbst bleibt unverändert (siehe Vorbild).
  socket.on("message", (msg) => {
    const leafId = msg.path[msg.path.length - 1];
    const ts = performance.now();
    ringFlashes.push({ id: leafId, ts });
    const branchId = branchKeyOf(leafId);
    if (branchId) ringFlashes.push({ id: branchId, ts });
  });
})();
