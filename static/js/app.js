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

    // ---- Links (strahlenförmig von der Wurzel weg) ----
    const linkGen = d3.linkRadial().angle((d) => d.x).radius((d) => d.y);

    linkLayer.selectAll("path.link")
      .data(hLinks, (d) => d.target.id)
      .join(
        (enter) => enter.append("path")
          .attr("class", "link")
          .style("stroke", (d) => colorFor(d.target.id, d.target.depth))
          .attr("d", (d) => {
            const o = { x: d.source.x, y: d.source.y };
            return linkGen({ source: o, target: o });
          })
          .call((enter) => enter.transition().duration(400).attr("d", linkGen)),
        (update) => update
          .style("stroke", (d) => colorFor(d.target.id, d.target.depth))
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
  function setStatus(status) {
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

  document.getElementById("fit-btn").addEventListener("click", fitToScreen);

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

  window.addEventListener("resize", () => render());
})();
