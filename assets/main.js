const STORAGE_KEY = 'NET_MAP_STATE_V8';

const state = {
    nodes: [],
    groups: [],
    edges: [],
    selected: null,
    isConnecting: false,
    connectSourceId: null,
    scale: 1,
    pan: { x: 0, y: 0 },
    isPanning: false,
    startPan: { x: 0, y: 0 },
    flowEnabled: true,
    theme: 'light',
    expandedAggregates: new Set()
};

const container = document.getElementById('canvas-container');
const viewport = document.getElementById('viewport');
const edgesLayer = document.getElementById('edges-layer');
const nodesContainer = document.getElementById('nodes-container');
const groupsContainer = document.getElementById('groups-container');
const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const sidebarTitle = document.getElementById('sidebar-title');

const domNodes = new Map();
const domGroups = new Map();

const uid = () => '_' + Math.random().toString(36).substr(2, 9);

function applyTheme(theme) {
    state.theme = theme;
    const isDark = theme === 'dark';
    document.body.classList.toggle('theme-dark', isDark);

    const arrowPath = document.getElementById('arrow-path');
    if (arrowPath) {
        arrowPath.setAttribute('fill', isDark ? '#22c55e' : '#2563eb');
    }

    const themeText = document.getElementById('theme-text');
    if (themeText) {
        themeText.innerText = isDark ? ' Тёмная тема' : ' Светлая тема';
    }
}

document.getElementById('btn-toggle-theme').onclick = () => {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    scheduleSave();
};

let saveTimeout = null;
function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const payload = {
            nodes: state.nodes,
            groups: state.groups,
            edges: state.edges,
            pan: state.pan,
            scale: state.scale,
            theme: state.theme
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('LocalStorage save failed:', e);
        }
    }, 300);
}

function loadSavedState() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
                state.nodes = parsed.nodes;
                state.groups = parsed.groups || [];
                state.edges = parsed.edges;
                state.pan = parsed.pan || { x: 0, y: 0 };
                state.scale = parsed.scale || 1;
                state.theme = parsed.theme || 'light';
                applyTheme(state.theme);
                return true;
            }
        }
    } catch (e) {
        console.error('Failed to load state', e);
    }
    applyTheme('light');
    return false;
}

function initDemo() {
    // ---------------------------------------------------------
    // 1. ЗОНЫ / ГРУППЫ СЕТИ
    // ---------------------------------------------------------
    const gExternal = {
        id: uid(),
        parentGroupId: null,
        name: 'External Threat Zone (Internet)',
        color: '#ef4444',
        x: 60,
        y: 80,
        width: 320,
        height: 440,
        collapsed: false
    };

    const gCorp = {
        id: uid(),
        parentGroupId: null,
        name: 'Corporate Office LAN (User Segment)',
        color: '#f59e0b',
        x: 440,
        y: 80,
        width: 380,
        height: 440,
        collapsed: false
    };

    const gDC = {
        id: uid(),
        parentGroupId: null,
        name: 'Restricted Data Center (Core Infra)',
        color: '#10b981',
        x: 880,
        y: 80,
        width: 380,
        height: 440,
        collapsed: false
    };

    state.groups.push(gExternal, gCorp, gDC);

    // ---------------------------------------------------------
    // 2. УЗЛЫ / ХОСТЫ
    // ---------------------------------------------------------
    const nC2 = {
        id: uid(),
        name: 'Attacker C2 Server',
        ip: '198.51.100.89',
        type: 'Malicious',
        groupId: gExternal.id,
        x: 90,
        y: 160
    };
    const nDropZone = {
        id: uid(),
        name: 'Exfil Drop / Cloud Storage',
        ip: '203.0.113.44',
        type: 'Malicious',
        groupId: gExternal.id,
        x: 90,
        y: 400
    };

    const nVictim = {
        id: uid(),
        name: 'Compromised Workstation',
        ip: '10.10.20.105',
        type: 'Host',
        groupId: gCorp.id,
        x: 480,
        y: 160
    };
    const nProxy = {
        id: uid(),
        name: 'Corp Edge Gateway / Proxy',
        ip: '10.10.1.1',
        type: 'Gateway',
        groupId: gCorp.id,
        x: 480,
        y: 400
    };

    const nDC = {
        id: uid(),
        name: 'Domain Controller (AD DS)',
        ip: '10.10.5.10',
        type: 'Server',
        groupId: gDC.id,
        x: 920,
        y: 160
    };
    const nDB = {
        id: uid(),
        name: 'Core Finance & Customer DB',
        ip: '10.10.5.50',
        type: 'Database',
        groupId: gDC.id,
        x: 920,
        y: 400
    };

    state.nodes.push(nC2, nDropZone, nVictim, nProxy, nDC, nDB);

    // ---------------------------------------------------------
    // 3. ПОТОКИ ДАННЫХ
    // ---------------------------------------------------------
    state.edges.push({
        id: uid(),
        from: nVictim.id,
        to: nC2.id,
        port: '443',
        flow: 'Reverse HTTPS Beacon (C2)'
    });

    state.edges.push({
        id: uid(),
        from: nVictim.id,
        to: nDC.id,
        port: '445',
        flow: 'Pass-the-Ticket / DCSync'
    });

    state.edges.push({
        id: uid(),
        from: nDC.id,
        to: nDB.id,
        port: '88',
        flow: 'Kerberos Ticket TGS'
    });

    state.edges.push({
        id: uid(),
        from: nDB.id,
        to: nVictim.id,
        port: '5432',
        flow: 'SQL Dump / PII Staging'
    });

    state.edges.push({
        id: uid(),
        from: nVictim.id,
        to: nProxy.id,
        port: '3128',
        flow: 'Encrypted Tunnel (Connect)'
    });

    state.edges.push({
        id: uid(),
        from: nProxy.id,
        to: nDropZone.id,
        port: '8443',
        flow: 'Exfiltrated Archive (7z/TLS)'
    });
}

function updateTransform() {
    viewport.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
    const zoomBtn = document.getElementById('btn-zoom-reset');
    if (zoomBtn) {
        zoomBtn.innerText = Math.round(state.scale * 100) + '%';
    }
}

container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const mouseX = e.clientX - container.offsetLeft;
    const mouseY = e.clientY - container.offsetTop;
    const prevScale = state.scale;

    if (e.deltaY < 0) state.scale = Math.min(3, state.scale * zoomFactor);
    else state.scale = Math.max(0.2, state.scale / zoomFactor);

    state.pan.x = mouseX - (mouseX - state.pan.x) * (state.scale / prevScale);
    state.pan.y = mouseY - (mouseY - state.pan.y) * (state.scale / prevScale);
    updateTransform();
    scheduleSave();
}, { passive: false });

container.addEventListener('mousedown', (e) => {
    if (e.target === container || e.target === viewport || e.target === edgesLayer) {
        state.isPanning = true;
        state.startPan = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
        clearSelection();
    }
});

window.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
        state.pan.x = e.clientX - state.startPan.x;
        state.pan.y = e.clientY - state.startPan.y;
        updateTransform();
    }
});

window.addEventListener('mouseup', () => {
    if (state.isPanning) {
        state.isPanning = false;
        scheduleSave();
    }
});

function isGroupEffectivelyCollapsed(groupId) {
    if (!groupId) return false;
    const g = state.groups.find(item => item.id === groupId);
    if (!g) return false;
    if (g.collapsed) return true;
    return isGroupEffectivelyCollapsed(g.parentGroupId);
}

function getNodeIcon(type) {
    switch (type) {
        case 'Server':
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
        case 'Malicious': return '😈';
        case 'Gateway': return '🌐';
        case 'Database': return '🗄️';
        case 'Firewall': return '🛡';
        default: return '🖥️';
    }
}

function quickSpawnConnectedNode(sourceNodeId, direction) {
    const srcNode = state.nodes.find(n => n.id === sourceNodeId);
    if (!srcNode) return;

    const GAP_X = 220;
    const GAP_Y = 110;

    let targetX = srcNode.x;
    let targetY = srcNode.y;

    if (direction === 'right') targetX += GAP_X;
    else if (direction === 'left') targetX -= GAP_X;
    else if (direction === 'bottom') targetY += GAP_Y;
    else if (direction === 'top') targetY -= GAP_Y;

    const parentGroupId = srcNode.groupId;
    if (parentGroupId) {
        const clamped = clampWithinParentGroup(targetX, targetY, 95, 28, parentGroupId);
        targetX = clamped.x;
        targetY = clamped.y;
    }

    const nextIdx = state.nodes.length + 1;
    const newNode = {
        id: uid(),
        name: 'Host-' + nextIdx,
        ip: '10.0.1.' + (10 + nextIdx),
        type: 'Host',
        groupId: parentGroupId,
        x: Math.round(targetX),
        y: Math.round(targetY)
    };
    state.nodes.push(newNode);

    state.edges.push({
        id: uid(),
        from: srcNode.id,
        to: newNode.id,
        port: '80',
        flow: 'Traffic'
    });

    selectItem('node', newNode.id);
    render();
    scheduleSave();
}

function syncNodesDOM() {
    const activeIds = new Set(state.nodes.map(n => n.id));
    for (const [id, el] of domNodes.entries()) {
        if (!activeIds.has(id)) {
            el.remove();
            domNodes.delete(id);
        }
    }

    state.nodes.forEach(n => {
        const isHidden = isGroupEffectivelyCollapsed(n.groupId);

        let el = domNodes.get(n.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'node-element';
            el.setAttribute('data-id', n.id);
            enableNodeDrag(el, n);
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.isConnecting) handleConnectClick(n.id);
                else selectItem('node', n.id);
            });
            nodesContainer.appendChild(el);
            domNodes.set(n.id, el);
        }

        el.style.display = isHidden ? 'none' : 'inline-flex';
        el.style.left = n.x + 'px';
        el.style.top = n.y + 'px';

        const icon = getNodeIcon(n.type);
        el.className = `node-element ${n.type === 'Malicious' ? 'malicious' : ''} ${state.selected?.id === n.id ? 'selected' : ''} ${state.isConnecting && state.connectSourceId === n.id ? 'connecting-source' : ''}`;

        el.innerHTML = `
          <span>${icon}</span><span class="node-text">${n.ip || n.name}</span>
          <div class="quick-port port-right" data-dir="right" title="Создать связь вправо">+</div>
          <div class="quick-port port-left" data-dir="left" title="Создать связь влево">+</div>
          <div class="quick-port port-top" data-dir="top" title="Создать связь вверх">+</div>
          <div class="quick-port port-bottom" data-dir="bottom" title="Создать связь вниз">+</div>
        `;

        el.querySelectorAll('.quick-port').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dir = btn.getAttribute('data-dir');
                quickSpawnConnectedNode(n.id, dir);
            });
        });
    });
}

function getGroupDepth(groupId) {
    let depth = 0;
    let curr = state.groups.find(g => g.id === groupId);
    while (curr && curr.parentGroupId) {
        depth++;
        curr = state.groups.find(g => g.id === curr.parentGroupId);
    }
    return depth;
}

function hexToRgba(hex, alpha) {
    hex = (hex || '#0284c7').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) || 2;
    const g = parseInt(hex.substring(2, 4), 16) || 132;
    const b = parseInt(hex.substring(4, 6), 16) || 199;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function syncGroupsDOM() {
    const activeIds = new Set(state.groups.map(g => g.id));
    for (const [id, el] of domGroups.entries()) {
        if (!activeIds.has(id)) {
            el.remove();
            domGroups.delete(id);
        }
    }

    state.groups.forEach(g => {
        const isHidden = isGroupEffectivelyCollapsed(g.parentGroupId);

        let el = domGroups.get(g.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'group-element';
            el.setAttribute('data-id', g.id);
            enableGroupDrag(el, g);
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                selectItem('group', g.id);
            });
            groupsContainer.appendChild(el);
            domGroups.set(g.id, el);
        }

        const color = g.color || '#0284c7';
        const depth = getGroupDepth(g.id);
        el.style.zIndex = 5 + depth;
        el.style.display = isHidden ? 'none' : 'block';
        el.style.setProperty('--group-color', color);
        el.style.setProperty('--group-bg-custom', hexToRgba(color, 0.05));
        el.style.setProperty('--group-header-bg', hexToRgba(color, 0.15));

        el.className = `group-element ${state.selected?.id === g.id ? 'selected' : ''} ${g.collapsed ? 'collapsed' : ''}`;
        el.style.left = g.x + 'px';
        el.style.top = g.y + 'px';
        el.style.width = g.width + 'px';
        if (!g.collapsed) el.style.height = g.height + 'px';

        el.innerHTML = `
          <div class="group-header">
            <span>🔲 ${g.name} ${g.collapsed ? '*' : ''}</span>
            <button class="collapse-btn">${g.collapsed ? 'Развернуть' : 'Свернуть'}</button>
          </div>
          ${!g.collapsed ? `
            <div class="resizer r-e" data-dir="e"></div>
            <div class="resizer r-w" data-dir="w"></div>
            <div class="resizer r-s" data-dir="s"></div>
            <div class="resizer r-n" data-dir="n"></div>
            <div class="resizer corner r-se" data-dir="se"></div>
            <div class="resizer corner r-sw" data-dir="sw"></div>
            <div class="resizer corner r-ne" data-dir="ne"></div>
            <div class="resizer corner r-nw" data-dir="nw"></div>
          ` : ''}
        `;

        el.querySelector('.collapse-btn').onclick = (e) => {
            e.stopPropagation();
            g.collapsed = !g.collapsed;
            render();
            scheduleSave();
        };

        if (!g.collapsed) {
            el.querySelectorAll('.resizer').forEach(handle => {
                enableUniversalResize(handle, g, el);
            });
        }
    });
}

function getNodeBox(node) {
    if (node.groupId) {
        let currentGroup = state.groups.find(g => g.id === node.groupId);
        let topCollapsed = null;
        while (currentGroup) {
            if (currentGroup.collapsed) {
                topCollapsed = currentGroup;
            }
            currentGroup = currentGroup.parentGroupId ? state.groups.find(g => g.id === currentGroup.parentGroupId) : null;
        }
        if (topCollapsed) {
            const w = topCollapsed.width || 200;
            const h = 36;
            return {
                x: topCollapsed.x,
                y: topCollapsed.y,
                w: w,
                h: h,
                cx: topCollapsed.x + w / 2,
                cy: topCollapsed.y + h / 2
            };
        }
    }

    const el = domNodes.get(node.id);
    let w = 110;
    let h = 28;
    if (el) {
        w = Math.max(105, el.offsetWidth || 110);
        h = el.offsetHeight || 28;
    }

    return {
        x: node.x,
        y: node.y,
        w: w,
        h: h,
        cx: node.x + w / 2,
        cy: node.y + h / 2
    };
}

function getBoxBorderIntersection(box, targetX, targetY) {
    const dx = targetX - box.cx;
    const dy = targetY - box.cy;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        return { x: box.cx, y: box.cy };
    }

    const hw = box.w / 2;
    const hh = box.h / 2;

    const scaleX = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
    const scale = Math.min(scaleX, scaleY);

    return {
        x: box.cx + dx * scale,
        y: box.cy + dy * scale
    };
}

function calculateEdgeGeometry(fn, tn, index, total) {
    const b1 = getNodeBox(fn);
    const b2 = getNodeBox(tn);
    if (!b1 || !b2 || (b1.cx === b2.cx && b1.cy === b2.cy)) return null;

    const dx = b2.cx - b1.cx;
    const dy = b2.cy - b1.cy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;

    let curvature = 0;
    if (total > 1) {
        curvature = (index - (total - 1) / 2) * 38;
    }

    const mx = (b1.cx + b2.cx) / 2;
    const my = (b1.cy + b2.cy) / 2;
    const cx = mx + nx * curvature;
    const cy = my + ny * curvature;

    const targetForStart = (total === 1 || curvature === 0) ? b2.cx : cx;
    const targetForStartY = (total === 1 || curvature === 0) ? b2.cy : cy;

    const p1 = getBoxBorderIntersection(b1, targetForStart, targetForStartY);
    const p2 = getBoxBorderIntersection(b2, (total === 1 || curvature === 0) ? b1.cx : cx, (total === 1 || curvature === 0) ? b1.cy : cy);

    const pathData = (total === 1 || curvature === 0)
        ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
        : `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`;

    const labelX = (total === 1 || curvature === 0) ? mx : 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x;
    const labelY = (total === 1 || curvature === 0) ? my : 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;

    return { pathData, labelX, labelY };
}

function renderEdges() {
    const defs = edgesLayer.querySelector('defs');
    edgesLayer.innerHTML = '';
    edgesLayer.appendChild(defs);

    const pairMap = new Map();
    state.edges.forEach(e => {
        const pairKey = [e.from, e.to].sort().join(':::');
        if (!pairMap.has(pairKey)) pairMap.set(pairKey, []);
        pairMap.get(pairKey).push(e);
    });

    pairMap.forEach((edges, pairKey) => {
        const baseFromId = edges[0].from;
        const baseToId = edges[0].to;
        const baseFn = state.nodes.find(n => n.id === baseFromId);
        const baseTn = state.nodes.find(n => n.id === baseToId);
        if (!baseFn || !baseTn) return;

        const shouldAggregate = edges.length >= 5 && !state.expandedAggregates.has(pairKey);

        if (shouldAggregate) {
            const geom = calculateEdgeGeometry(baseFn, baseTn, 0, 1);
            if (!geom) return;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', geom.pathData);
            path.setAttribute('class', 'edge-line');
            path.setAttribute('marker-end', 'url(#arrow)');
            edgesLayer.appendChild(path);

            if (state.flowEnabled) {
                const flow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                flow.setAttribute('d', geom.pathData);
                flow.setAttribute('class', 'edge-flow-particles');
                edgesLayer.appendChild(flow);
            }

            const uniquePorts = Array.from(new Set(edges.map(e => e.port).filter(Boolean)));
            const summaryText = `📦 [${edges.length} связей: ${uniquePorts.slice(0, 3).join(', ')}${uniquePorts.length > 3 ? '...' : ''}] ▾`;

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');

            text.setAttribute('x', geom.labelX);
            text.setAttribute('y', geom.labelY);
            text.setAttribute('class', 'edge-label-text');
            text.textContent = summaryText;

            const tw = Math.ceil(summaryText.length * 7.8) + 18;
            rect.setAttribute('x', geom.labelX - tw / 2);
            rect.setAttribute('y', geom.labelY - 10);
            rect.setAttribute('width', tw);
            rect.setAttribute('height', 20);
            rect.setAttribute('class', 'edge-label-bg aggregated');

            rect.addEventListener('click', (e) => {
                e.stopPropagation();
                state.expandedAggregates.add(pairKey);
                renderEdges();
            });

            g.appendChild(rect);
            g.appendChild(text);
            edgesLayer.appendChild(g);

        } else {
            edges.forEach((edge, idx) => {
                const actualFn = state.nodes.find(n => n.id === edge.from);
                const actualTn = state.nodes.find(n => n.id === edge.to);
                if (!actualFn || !actualTn) return;

                const effectiveIdx = (edge.from === baseFromId) ? idx : (edges.length - 1 - idx);
                const geom = calculateEdgeGeometry(actualFn, actualTn, effectiveIdx, edges.length);
                if (!geom) return;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', geom.pathData);
                path.setAttribute('class', `edge-line ${state.selected?.id === edge.id ? 'selected' : ''}`);
                path.setAttribute('marker-end', 'url(#arrow)');
                path.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectItem('edge', edge.id);
                });
                edgesLayer.appendChild(path);

                if (state.flowEnabled) {
                    const flow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    flow.setAttribute('d', geom.pathData);
                    flow.setAttribute('class', 'edge-flow-particles');
                    edgesLayer.appendChild(flow);
                }

                let labelText = `${edge.port ? '[' + edge.port + '] ' : ''}${edge.flow || ''}`.trim();
                if (edges.length >= 5 && idx === 0) {
                    labelText += ' (▴ свернуть)';
                }

                if (labelText) {
                    const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');

                    text.setAttribute('x', geom.labelX);
                    text.setAttribute('y', geom.labelY);
                    text.setAttribute('class', 'edge-label-text');
                    text.textContent = labelText;

                    textGroup.appendChild(rect);
                    textGroup.appendChild(text);
                    edgesLayer.appendChild(textGroup);

                    let textWidth = 60;
                    try {
                        const bbox = text.getBBox();
                        textWidth = Math.max(50, Math.ceil(bbox.width) + 16);
                    } catch (e) {
                        textWidth = Math.max(50, Math.ceil(labelText.length * 7.8) + 16);
                    }

                    rect.setAttribute('x', geom.labelX - textWidth / 2);
                    rect.setAttribute('y', geom.labelY - 10);
                    rect.setAttribute('width', textWidth);
                    rect.setAttribute('height', 20);
                    rect.setAttribute('class', 'edge-label-bg');

                    rect.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (edges.length >= 5 && idx === 0) {
                            state.expandedAggregates.delete(pairKey);
                            renderEdges();
                        } else {
                            selectItem('edge', edge.id);
                        }
                    });
                }
            });
        }
    });
}

function render() {
    syncGroupsDOM();
    syncNodesDOM();
    renderEdges();
}

function enableUniversalResize(handleEl, group, groupDiv) {
    let isResizing = false;
    let dir = '';
    let startX = 0, startY = 0;
    let initX = 0, initY = 0, initW = 0, initH = 0;

    const startResize = (clientX, clientY, targetDir) => {
        isResizing = true;
        dir = targetDir;
        startX = clientX;
        startY = clientY;
        initX = group.x;
        initY = group.y;
        initW = group.width;
        initH = group.height;
    };

    const doResize = (clientX, clientY) => {
        if (!isResizing) return;
        const dx = (clientX - startX) / state.scale;
        const dy = (clientY - startY) / state.scale;

        let newX = initX, newY = initY, newW = initW, newH = initH;

        if (dir.includes('e')) newW = Math.max(160, initW + dx);
        else if (dir.includes('w')) {
            const maxDx = initW - 160;
            const appliedDx = Math.min(dx, maxDx);
            newX = initX + appliedDx;
            newW = initW - appliedDx;
        }

        if (dir.includes('s')) newH = Math.max(100, initH + dy);
        else if (dir.includes('n')) {
            const maxDy = initH - 100;
            const appliedDy = Math.min(dy, maxDy);
            newY = initY + appliedDy;
            newH = initH - appliedDy;
        }

        group.x = Math.round(newX);
        group.y = Math.round(newY);
        group.width = Math.round(newW);
        group.height = Math.round(newH);

        groupDiv.style.left = group.x + 'px';
        groupDiv.style.top = group.y + 'px';
        groupDiv.style.width = group.width + 'px';
        groupDiv.style.height = group.height + 'px';

        renderEdges();
    };

    const stopResize = () => {
        if (isResizing) {
            isResizing = false;
            scheduleSave();
        }
    };

    handleEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        startResize(e.clientX, e.clientY, handleEl.getAttribute('data-dir'));
        const onMouseMove = (ev) => doResize(ev.clientX, ev.clientY);
        const onMouseUp = () => {
            stopResize();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    handleEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        startResize(e.touches[0].clientX, e.touches[0].clientY, handleEl.getAttribute('data-dir'));

        const onTouchMove = (ev) => {
            if (!isResizing || ev.touches.length !== 1) return;
            ev.preventDefault();
            doResize(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const onTouchEnd = () => {
            stopResize();
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }, { passive: false });
}

function clampWithinParentGroup(x, y, elemWidth, elemHeight, parentGroupId) {
    if (!parentGroupId) return { x, y };
    const parent = state.groups.find(g => g.id === parentGroupId);
    if (!parent) return { x, y };

    const minX = parent.x + 8;
    const maxX = parent.x + parent.width - elemWidth - 8;
    const minY = parent.y + 36;
    const maxY = parent.y + parent.height - elemHeight - 8;

    return {
        x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
        y: Math.min(Math.max(y, minY), Math.max(minY, maxY))
    };
}

function enableNodeDrag(el, node) {
    let isDragging = false, sx, sy, moved = false;

    const startDrag = (clientX, clientY) => {
        if (state.isConnecting) return;
        isDragging = true;
        moved = false;
        sx = clientX;
        sy = clientY;
    };

    const moveDrag = (clientX, clientY) => {
        if (!isDragging) return;
        if (Math.hypot(clientX - sx, clientY - sy) > 4) moved = true;

        const dx = (clientX - sx) / state.scale;
        const dy = (clientY - sy) / state.scale;

        let targetX = node.x + dx;
        let targetY = node.y + dy;

        if (node.groupId) {
            const clamped = clampWithinParentGroup(targetX, targetY, 95, 28, node.groupId);
            targetX = clamped.x;
            targetY = clamped.y;
        }

        node.x = targetX;
        node.y = targetY;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        sx = clientX;
        sy = clientY;
        renderEdges();
    };

    const endDrag = () => {
        if (isDragging) {
            isDragging = false;
            scheduleSave();
        }
    };

    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('.quick-port')) return;
        e.stopPropagation();
        startDrag(e.clientX, e.clientY);
        const onMouseMove = (ev) => moveDrag(ev.clientX, ev.clientY);
        const onMouseUp = () => {
            endDrag();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);

        const onTouchMove = (ev) => {
            if (!isDragging || ev.touches.length !== 1) return;
            ev.preventDefault();
            moveDrag(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const onTouchEnd = () => {
            endDrag();
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }, { passive: false });

    el.addEventListener('click', (e) => {
        if (moved) {
            e.stopPropagation();
            moved = false;
        }
    }, true);
}

function moveGroupRecursively(groupId, dx, dy) {
    state.nodes.forEach(n => {
        if (n.groupId === groupId) {
            n.x += dx;
            n.y += dy;
            const nodeEl = domNodes.get(n.id);
            if (nodeEl) {
                nodeEl.style.left = n.x + 'px';
                nodeEl.style.top = n.y + 'px';
            }
        }
    });

    state.groups.forEach(cg => {
        if (cg.parentGroupId === groupId) {
            cg.x += dx;
            cg.y += dy;
            const gEl = domGroups.get(cg.id);
            if (gEl) {
                gEl.style.left = cg.x + 'px';
                gEl.style.top = cg.y + 'px';
            }
            moveGroupRecursively(cg.id, dx, dy);
        }
    });
}

function enableGroupDrag(el, group) {
    let isDragging = false, sx, sy, moved = false;

    const startDrag = (clientX, clientY) => {
        if (state.isConnecting) return;
        isDragging = true;
        moved = false;
        sx = clientX;
        sy = clientY;
    };

    const moveDrag = (clientX, clientY) => {
        if (!isDragging) return;
        if (Math.hypot(clientX - sx, clientY - sy) > 4) moved = true;

        const dx = (clientX - sx) / state.scale;
        const dy = (clientY - sy) / state.scale;

        let targetX = group.x + dx;
        let targetY = group.y + dy;

        if (group.parentGroupId) {
            const clamped = clampWithinParentGroup(targetX, targetY, group.width, group.height, group.parentGroupId);
            const appliedDx = clamped.x - group.x;
            const appliedDy = clamped.y - group.y;
            group.x = clamped.x;
            group.y = clamped.y;
            moveGroupRecursively(group.id, appliedDx, appliedDy);
        } else {
            group.x = targetX;
            group.y = targetY;
            moveGroupRecursively(group.id, dx, dy);
        }

        el.style.left = group.x + 'px';
        el.style.top = group.y + 'px';
        sx = clientX;
        sy = clientY;
        renderEdges();
    };

    const endDrag = () => {
        if (isDragging) {
            isDragging = false;
            scheduleSave();
        }
    };

    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.classList.contains('collapse-btn') || e.target.classList.contains('resizer')) return;
        e.stopPropagation();
        startDrag(e.clientX, e.clientY);

        const onMouseMove = (ev) => moveDrag(ev.clientX, ev.clientY);
        const onMouseUp = () => {
            endDrag();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || e.target.classList.contains('collapse-btn') || e.target.classList.contains('resizer')) return;
        e.stopPropagation();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);

        const onTouchMove = (ev) => {
            if (!isDragging || ev.touches.length !== 1) return;
            ev.preventDefault();
            moveDrag(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const onTouchEnd = (ev) => {
            if (isDragging) {
                ev.stopPropagation();
                endDrag();
            }
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }, { passive: false });

    el.addEventListener('click', (e) => {
        if (moved) {
            e.stopPropagation();
            moved = false;
        }
    }, true);
}

function clearSelection() {
    state.selected = null;
    sidebar.style.display = 'none';
    sidebarContent.innerHTML = '';
    render();
}

function confirmAndDeleteCurrent() {
    if (!state.selected) return;
    const { type, id } = state.selected;

    let confirmMsg = 'Вы уверены, что хотите удалить выбранный объект?';
    if (type === 'node') {
        const n = state.nodes.find(item => item.id === id);
        confirmMsg = `Удалить хост "${n ? (n.ip || n.name) : ''}"? Все связанные потоки также будут удалены.`;
    } else if (type === 'edge') {
        const e = state.edges.find(item => item.id === id);
        confirmMsg = `Удалить связь [${e ? e.port : ''}] "${e ? e.flow : ''}"?`;
    } else if (type === 'group') {
        const g = state.groups.find(item => item.id === id);
        confirmMsg = `Удалить группу "${g ? g.name : ''}"? (Вложенные хосты и подгруппы перейдут на уровень выше)`;
    }

    if (confirm(confirmMsg)) {
        if (type === 'node') {
            state.nodes = state.nodes.filter(n => n.id !== id);
            state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
        } else if (type === 'edge') {
            state.edges = state.edges.filter(e => e.id !== id);
        } else if (type === 'group') {
            const removedGroup = state.groups.find(g => g.id === id);
            const parentId = removedGroup ? removedGroup.parentGroupId : null;
            state.groups = state.groups.filter(g => g.id !== id);
            state.groups.forEach(g => { if (g.parentGroupId === id) g.parentGroupId = parentId; });
            state.nodes.forEach(n => { if (n.groupId === id) n.groupId = parentId; });
        }
        clearSelection();
        scheduleSave();
    }
}

function isDescendantGroup(potentialChildId, targetGroupId) {
    let curr = state.groups.find(g => g.id === potentialChildId);
    while (curr && curr.parentGroupId) {
        if (curr.parentGroupId === targetGroupId) return true;
        curr = state.groups.find(g => g.id === curr.parentGroupId);
    }
    return false;
}

function selectItem(type, id) {
    state.selected = { type, id };
    render();
    sidebar.style.display = 'block';
    sidebarContent.innerHTML = '';

    if (type === 'node') {
        const node = state.nodes.find(n => n.id === id);
        if (!node) return;
        sidebarTitle.innerText = 'Хост';
        let groupOptions = `<option value="">-- Без группы (Свободный) --</option>`;
        state.groups.forEach(g => {
            groupOptions += `<option value="${g.id}" ${node.groupId === g.id ? 'selected' : ''}>${g.name}</option>`;
        });

        sidebarContent.innerHTML = `
          <div class="form-group"><label>Имя</label><input type="text" id="prop-name" value="${node.name}"></div>
          <div class="form-group"><label>IP Адрес</label><input type="text" id="prop-ip" value="${node.ip || ''}"></div>
          <div class="form-group"><label>Привязка к группе</label><select id="prop-group">${groupOptions}</select></div>
          <div class="form-group"><label>Тип</label><select id="prop-type">
            <option value="Host" ${node.type==='Host'?'selected':''}>Обычный хост (Host)</option>
            <option value="Server" ${node.type==='Server'?'selected':''}>Сервер (Server)</option>
            <option value="Malicious" ${node.type==='Malicious'?'selected':''}>Вредоносный хост (Malicious)</option>
            <option value="Gateway" ${node.type==='Gateway'?'selected':''}>Шлюз / Маршрутизатор (Gateway)</option>
            <option value="Database" ${node.type==='Database'?'selected':''}>База Данных (DB)</option>
            <option value="Firewall" ${node.type==='Firewall'?'selected':''}>Файрвол (FW)</option>
          </select></div>
          <button class="btn btn-danger sidebar-delete-btn" id="sidebar-delete-action">🗑️ Удалить этот хост</button>
        `;
        document.getElementById('prop-name').oninput = (e) => { node.name = e.target.value; syncNodesDOM(); scheduleSave(); };
        document.getElementById('prop-ip').oninput = (e) => { node.ip = e.target.value; syncNodesDOM(); scheduleSave(); };
        document.getElementById('prop-group').onchange = (e) => {
            node.groupId = e.target.value || null;
            if (node.groupId) {
                const clamped = clampWithinParentGroup(node.x, node.y, 95, 28, node.groupId);
                node.x = clamped.x;
                node.y = clamped.y;
            }
            render();
            scheduleSave();
        };
        document.getElementById('prop-type').onchange = (e) => { node.type = e.target.value; syncNodesDOM(); scheduleSave(); };
        document.getElementById('sidebar-delete-action').onclick = confirmAndDeleteCurrent;
    }

    if (type === 'edge') {
        const edge = state.edges.find(e => e.id === id);
        if (!edge) return;
        sidebarTitle.innerText = 'Связь (Поток)';
        sidebarContent.innerHTML = `
          <div class="form-group"><label>Порт назначения (dst_port)</label><input type="text" id="prop-port" value="${edge.port || ''}"></div>
          <div class="form-group"><label>Назначение (comment)</label><input type="text" id="prop-flow" value="${edge.flow || ''}"></div>
          <button class="btn btn-danger sidebar-delete-btn" id="sidebar-delete-action">🗑️ Удалить эту связь</button>
        `;
        document.getElementById('prop-port').oninput = (e) => { edge.port = e.target.value; renderEdges(); scheduleSave(); };
        document.getElementById('prop-flow').oninput = (e) => { edge.flow = e.target.value; renderEdges(); scheduleSave(); };
        document.getElementById('sidebar-delete-action').onclick = confirmAndDeleteCurrent;
    }

    if (type === 'group') {
        const group = state.groups.find(g => g.id === id);
        if (!group) return;
        sidebarTitle.innerText = 'Группа / Сеть';

        let parentOptions = `<option value="">-- Корневой уровень (без родителя) --</option>`;
        state.groups.forEach(g => {
            if (g.id !== group.id && !isDescendantGroup(g.id, group.id)) {
                parentOptions += `<option value="${g.id}" ${group.parentGroupId === g.id ? 'selected' : ''}>${g.name}</option>`;
            }
        });

        sidebarContent.innerHTML = `
          <div class="form-group"><label>Название</label><input type="text" id="prop-gname" value="${group.name}"></div>
          <div class="form-group"><label>Цвет группы</label><input type="color" id="prop-gcolor" value="${group.color || '#0284c7'}"></div>
          <div class="form-group"><label>Родительская группа</label><select id="prop-gparent">${parentOptions}</select></div>
          <div class="form-group"><label>Ширина (px)</label><input type="number" id="prop-gw" value="${group.width}"></div>
          <div class="form-group"><label>Высота (px)</label><input type="number" id="prop-gh" value="${group.height}"></div>
          <button class="btn btn-danger sidebar-delete-btn" id="sidebar-delete-action">🗑️ Удалить эту группу</button>
        `;
        document.getElementById('prop-gname').oninput = (e) => { group.name = e.target.value; render(); scheduleSave(); };
        document.getElementById('prop-gcolor').oninput = (e) => { group.color = e.target.value; render(); scheduleSave(); };
        document.getElementById('prop-gparent').onchange = (e) => {
            group.parentGroupId = e.target.value || null;
            if (group.parentGroupId) {
                const clamped = clampWithinParentGroup(group.x, group.y, group.width, group.height, group.parentGroupId);
                const dx = clamped.x - group.x;
                const dy = clamped.y - group.y;
                group.x = clamped.x;
                group.y = clamped.y;
                moveGroupRecursively(group.id, dx, dy);
            }
            render();
            scheduleSave();
        };
        document.getElementById('prop-gw').oninput = (e) => { group.width = parseInt(e.target.value) || 160; render(); scheduleSave(); };
        document.getElementById('prop-gh').oninput = (e) => { group.height = parseInt(e.target.value) || 100; render(); scheduleSave(); };
        document.getElementById('sidebar-delete-action').onclick = confirmAndDeleteCurrent;
    }
}

document.getElementById('btn-close-sidebar').onclick = () => { sidebar.style.display = 'none'; };

function handleConnectClick(nodeId) {
    if (!state.connectSourceId) {
        state.connectSourceId = nodeId;
        syncNodesDOM();
    } else {
        if (state.connectSourceId !== nodeId) {
            state.edges.push({
                id: uid(),
                from: state.connectSourceId,
                to: nodeId,
                port: '80',
                flow: 'Traffic'
            });
            scheduleSave();
        }
        state.isConnecting = false;
        state.connectSourceId = null;
        document.getElementById('btn-connect').classList.remove('active');
        render();
    }
}

document.getElementById('btn-connect').onclick = () => {
    state.isConnecting = !state.isConnecting;
    state.connectSourceId = null;
    document.getElementById('btn-connect').classList.toggle('active', state.isConnecting);
    syncNodesDOM();
};

document.getElementById('btn-add-host').onclick = () => {
    const cx = (-state.pan.x + window.innerWidth / 2) / state.scale - 45;
    const cy = (-state.pan.y + window.innerHeight / 2) / state.scale - 14;
    const host = {
        id: uid(),
        name: 'Host-' + (state.nodes.length + 1),
        ip: '10.0.1.' + (10 + state.nodes.length),
        type: 'Host',
        groupId: null,
        x: Math.round(cx),
        y: Math.round(cy)
    };
    state.nodes.push(host);
    selectItem('node', host.id);
    scheduleSave();
};

document.getElementById('btn-add-group').onclick = () => {
    const cx = (-state.pan.x + window.innerWidth / 2) / state.scale - 140;
    const cy = (-state.pan.y + window.innerHeight / 2) / state.scale - 90;
    const group = {
        id: uid(),
        parentGroupId: null,
        name: 'Zone ' + (state.groups.length + 1),
        color: '#0284c7',
        x: Math.round(cx),
        y: Math.round(cy),
        width: 280,
        height: 180,
        collapsed: false
    };
    state.groups.push(group);
    selectItem('group', group.id);
    scheduleSave();
};

document.getElementById('btn-toggle-flow').onclick = () => {
    state.flowEnabled = !state.flowEnabled;
    document.body.classList.toggle('disable-flow', !state.flowEnabled);
    const flowText = document.getElementById('flow-text');
    const flowIcon = document.getElementById('flow-icon');
    if (flowText) flowText.innerText = state.flowEnabled ? ' Вкл.' : ' Выкл.';
    if (flowIcon) flowIcon.innerText = state.flowEnabled ? '💡' : '🔌';
    renderEdges();
};

document.getElementById('btn-clear-all').onclick = () => {
    if (state.nodes.length === 0 && state.groups.length === 0 && state.edges.length === 0) return;
    if (confirm('Стереть всё: вы уверены, что хотите удалить все элементы с карты?')) {
        state.nodes = [];
        state.groups = [];
        state.edges = [];
        clearSelection();
        scheduleSave();
    }
};

document.getElementById('btn-zoom-in').onclick = () => {
    state.scale = Math.min(3, state.scale * 1.2);
    updateTransform();
    scheduleSave();
};
document.getElementById('btn-zoom-out').onclick = () => {
    state.scale = Math.max(0.2, state.scale / 1.2);
    updateTransform();
    scheduleSave();
};
document.getElementById('btn-zoom-reset').onclick = () => {
    state.scale = 1;
    state.pan = { x: 0, y: 0 };
    updateTransform();
    scheduleSave();
};

document.getElementById('btn-save-json').onclick = () => {
    const data = JSON.stringify({
        version: 8,
        nodes: state.nodes,
        groups: state.groups,
        edges: state.edges,
        pan: state.pan,
        scale: state.scale,
        theme: state.theme
    }, null, 2);
    downloadBlob(data, 'network_topology.json', 'application/json');
};

document.getElementById('btn-load-json').onclick = () => {
    document.getElementById('json-file-input').click();
};

document.getElementById('json-file-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
                state.nodes = parsed.nodes;
                state.groups = parsed.groups || [];
                state.edges = parsed.edges;
                state.pan = parsed.pan || { x: 0, y: 0 };
                state.scale = parsed.scale || 1;
                applyTheme(parsed.theme || 'light');
                updateTransform();
                render();
                scheduleSave();
            } else {
                alert('Неверный формат JSON топологии');
            }
        } catch (err) {
            alert('Ошибка при чтении JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

const modal = document.getElementById('modal-overlay');
document.getElementById('btn-open-import').onclick = () => modal.classList.add('active');
document.getElementById('btn-cancel-import').onclick = () => modal.classList.remove('active');

document.getElementById('btn-run-import').onclick = () => {
    const text = document.getElementById('import-text').value.trim();
    if (!text) return modal.classList.remove('active');

    const lines = text.split('\n');
    const parsedRules = [];
    const distinctIps = new Set();
    const ipInDegree = new Map();
    const ipOutDegree = new Map();

    lines.forEach(line => {
        const parts = line.split(';').map(p => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
            const srcIp = parts[0];
            const dstIp = parts[1];
            const port = parts[2] || '';
            const flow = parts[3] || '';

            parsedRules.push({ srcIp, dstIp, port, flow });
            distinctIps.add(srcIp);
            distinctIps.add(dstIp);

            ipOutDegree.set(srcIp, (ipOutDegree.get(srcIp) || 0) + 1);
            ipInDegree.set(dstIp, (ipInDegree.get(dstIp) || 0) + 1);
        }
    });

    if (parsedRules.length === 0) return modal.classList.remove('active');

    const importGroupId = uid();
    const importGroup = {
        id: importGroupId,
        parentGroupId: null,
        name: 'Импорт (' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) + ')',
        color: '#0284c7',
        x: 200,
        y: 120,
        width: 600,
        height: 300,
        collapsed: false
    };

    if (state.groups.length > 0) {
        const maxBottom = Math.max(...state.groups.map(g => g.y + (g.collapsed ? 36 : g.height)));
        importGroup.y = maxBottom + 50;
    }
    state.groups.push(importGroup);

    const leftIps = [];
    const rightIps = [];

    distinctIps.forEach(ip => {
        const inDeg = ipInDegree.get(ip) || 0;
        const outDeg = ipOutDegree.get(ip) || 0;
        if (outDeg > 0 && inDeg === 0) leftIps.push(ip);
        else if (inDeg > 0 && outDeg === 0) rightIps.push(ip);
        else if (outDeg >= inDeg) leftIps.push(ip);
        else rightIps.push(ip);
    });

    if (leftIps.length === 0 && rightIps.length > 1) {
        const half = Math.ceil(rightIps.length / 2);
        leftIps.push(...rightIps.splice(0, half));
    } else if (rightIps.length === 0 && leftIps.length > 1) {
        const half = Math.ceil(leftIps.length / 2);
        rightIps.push(...leftIps.splice(0, half));
    }

    const padX = 30;
    const padY = 48;
    const gapX = 260;
    const gapY = 16;
    const nodeH = 28;

    const leftColX = importGroup.x + padX;
    const rightColX = leftColX + 110 + gapX;

    const totalRows = Math.max(leftIps.length, rightIps.length, 1);
    importGroup.width = padX * 2 + 220 + gapX;
    importGroup.height = padY + totalRows * (nodeH + gapY) + 20;

    const resolvedNodes = new Map();

    const placeOrUpdateNode = (ip, x, y, isServer) => {
        let node = state.nodes.find(n => n.ip === ip);
        if (!node) {
            node = {
                id: uid(),
                name: (isServer ? 'Srv-' : 'Client-') + ip.replace(/[^0-9]/g, '').slice(-4),
                ip: ip,
                type: isServer ? (ip.endsWith('.1') ? 'Gateway' : 'Server') : 'Host',
                groupId: importGroupId,
                x: Math.round(x),
                y: Math.round(y)
            };
            state.nodes.push(node);
        } else {
            node.groupId = importGroupId;
            node.x = Math.round(x);
            node.y = Math.round(y);
        }
        resolvedNodes.set(ip, node);
    };

    leftIps.forEach((ip, idx) => {
        const ny = importGroup.y + padY + idx * (nodeH + gapY);
        placeOrUpdateNode(ip, leftColX, ny, false);
    });

    rightIps.forEach((ip, idx) => {
        const ny = importGroup.y + padY + idx * (nodeH + gapY);
        placeOrUpdateNode(ip, rightColX, ny, true);
    });

    parsedRules.forEach(rule => {
        const srcNode = resolvedNodes.get(rule.srcIp);
        const dstNode = resolvedNodes.get(rule.dstIp);
        if (srcNode && dstNode) {
            const isIdentical = state.edges.some(
                e => e.from === srcNode.id && e.to === dstNode.id && e.port === rule.port && e.flow === rule.flow
            );
            if (!isIdentical) {
                state.edges.push({
                    id: uid(),
                    from: srcNode.id,
                    to: dstNode.id,
                    port: rule.port,
                    flow: rule.flow
                });
            }
        }
    });

    modal.classList.remove('active');
    selectItem('group', importGroupId);
    render();
    scheduleSave();
};

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'}[c]));
}

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('btn-export-svg').onclick = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.groups.forEach(g => {
        minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + g.width); maxY = Math.max(maxY, g.y + (g.collapsed ? 36 : g.height));
    });
    state.nodes.forEach(n => {
        const box = getNodeBox(n);
        minX = Math.min(minX, box.x); minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.w + 15); maxY = Math.max(maxY, box.y + box.h + 8);
    });
    if (minX === Infinity) return alert('Карта пуста');

    const p = 40;
    minX -= p; minY -= p;
    const w = (maxX - minX) + p * 2;
    const h = (maxY - minY) + p * 2;

    const isDark = state.theme === 'dark';
    const bgCol = isDark ? '#0b1120' : '#f8fafc';
    const edgeCol = isDark ? '#22c55e' : '#2563eb';
    const nodeCol = isDark ? '#1e293b' : '#ffffff';
    const textCol = isDark ? '#f8fafc' : '#0f172a';

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">\n<defs><marker id="svg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${edgeCol}" /></marker></defs>\n<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${bgCol}" />\n`;

    const sortedGroups = [...state.groups].sort((a, b) => getGroupDepth(a.id) - getGroupDepth(b.id));

    sortedGroups.forEach(g => {
        const gh = g.collapsed ? 36 : g.height;
        const col = g.color || '#0284c7';
        svg += `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${gh}" rx="8" fill="${hexToRgba(col, 0.06)}" stroke="${col}" stroke-dasharray="${g.collapsed?'0':'4,4'}" />\n`;
        svg += `<text x="${g.x+10}" y="${g.y+22}" fill="${col}" font-family="sans-serif" font-size="12" font-weight="bold">${escapeXml(g.name)} ${g.collapsed?'(свернуто)':''}</text>\n`;
    });

    const pairMap = new Map();
    state.edges.forEach(e => {
        const pairKey = [e.from, e.to].sort().join(':::');
        if (!pairMap.has(pairKey)) pairMap.set(pairKey, []);
        pairMap.get(pairKey).push(e);
    });

    pairMap.forEach(edges => {
        const baseFromId = edges[0].from;

        edges.forEach((edge, idx) => {
            const actualFn = state.nodes.find(n => n.id === edge.from);
            const actualTn = state.nodes.find(n => n.id === edge.to);
            if (!actualFn || !actualTn) return;

            const effectiveIdx = (edge.from === baseFromId) ? idx : (edges.length - 1 - idx);
            const geom = calculateEdgeGeometry(actualFn, actualTn, effectiveIdx, edges.length);
            if (!geom) return;

            svg += `<path d="${geom.pathData}" fill="none" stroke="${edgeCol}" stroke-width="2" stroke-dasharray="6,4" marker-end="url(#svg-arrow)" />\n`;
            const lbl = `${edge.port ? '[' + edge.port + '] ' : ''}${edge.flow || ''}`.trim();
            if (lbl) {
                const tw = Math.max(50, Math.ceil(lbl.length * 7.8) + 16);
                svg += `<rect x="${geom.labelX - tw/2}" y="${geom.labelY - 10}" width="${tw}" height="20" rx="4" fill="${nodeCol}" stroke="#cbd5e1" />\n`;
                svg += `<text x="${geom.labelX}" y="${geom.labelY + 4}" fill="${textCol}" font-family="monospace" font-size="10" text-anchor="middle">${escapeXml(lbl)}</text>\n`;
            }
        });
    });

    state.nodes.forEach(n => {
        if (isGroupEffectivelyCollapsed(n.groupId)) return;
        const box = getNodeBox(n);
        const icon = getNodeIcon(n.type);
        const strokeColor = n.type === 'Malicious' ? '#ef4444' : '#0284c7';

        svg += `<rect x="${n.x}" y="${n.y}" width="${box.w}" height="${box.h}" rx="6" fill="${nodeCol}" stroke="${strokeColor}" />\n`;

        if (n.type === 'Server') {
            svg += `<g transform="translate(${n.x + 8}, ${n.y + 7})" stroke="${strokeColor}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="0" y="0" width="14" height="6" rx="1"/>
                <rect x="0" y="8" width="14" height="6" rx="1"/>
                <circle cx="3" cy="3" r="0.5" fill="${strokeColor}"/>
                <circle cx="3" cy="11" r="0.5" fill="${strokeColor}"/>
            </g>\n`;
            svg += `<text x="${n.x + 26}" y="${n.y + 18}" fill="${textCol}" font-family="monospace" font-size="11">${escapeXml(n.ip || n.name)}</text>\n`;
        } else {
            svg += `<text x="${n.x + 8}" y="${n.y + 18}" fill="${textCol}" font-family="monospace" font-size="11">${icon} ${escapeXml(n.ip || n.name)}</text>\n`;
        }
    });

    svg += '</svg>';
    downloadBlob(svg, 'topology.svg', 'image/svg+xml');
};

document.getElementById('btn-export-drawio').onclick = () => {
    let cells = `
        <mxCell id="0" />
        <mxCell id="1" parent="0" />`;

    const isDark = state.theme === 'dark';
    const bgCol = isDark ? '#0b1120' : '#f8fafc';
    const nodeCol = isDark ? '#1e293b' : '#ffffff';
    const textCol = isDark ? '#f8fafc' : '#0f172a';
    const edgeCol = isDark ? '#22c55e' : '#2563eb';

    const sortedGroups = [...state.groups].sort((a, b) => getGroupDepth(a.id) - getGroupDepth(b.id));

    sortedGroups.forEach(g => {
        const gh = g.collapsed ? 36 : g.height;
        const col = g.color || '#0284c7';
        const parentId = g.parentGroupId ? g.parentGroupId : '1';

        let relX = g.x;
        let relY = g.y;
        if (g.parentGroupId) {
            const parentGroup = state.groups.find(p => p.id === g.parentGroupId);
            if (parentGroup) {
                relX = g.x - parentGroup.x;
                relY = g.y - parentGroup.y;
            }
        }

        const style = `swimlane;whiteSpace=wrap;html=1;dashed=${g.collapsed ? 0 : 1};fillColor=${nodeCol};strokeColor=${col};fontColor=${col};startSize=26;rounded=1;arcSize=8;`;
        cells += `
        <mxCell id="${g.id}" value="${escapeXml(g.name)}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${relX}" y="${relY}" width="${g.width}" height="${gh}" as="geometry" />
        </mxCell>`;
    });

    state.nodes.forEach(n => {
        const box = getNodeBox(n);
        const iconSymbol = n.type === 'Server' ? '🖴' : getNodeIcon(n.type);
        const lbl = `${iconSymbol} ${escapeXml(n.ip || n.name)}`;
        const stroke = n.type === 'Malicious' ? '#ef4444' : '#0284c7';
        const parentId = n.groupId ? n.groupId : '1';

        let relX = n.x;
        let relY = n.y;
        if (n.groupId) {
            const parentGroup = state.groups.find(p => p.id === n.groupId);
            if (parentGroup) {
                relX = n.x - parentGroup.x;
                relY = n.y - parentGroup.y;
            }
        }

        const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${nodeCol};strokeColor=${stroke};fontColor=${textCol};fontFamily=monospace;fontSize=11;`;
        cells += `
        <mxCell id="${n.id}" value="${lbl}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${relX}" y="${relY}" width="${box.w}" height="${box.h}" as="geometry" />
        </mxCell>`;
    });

    const pairMap = new Map();
    state.edges.forEach(e => {
        const pairKey = [e.from, e.to].sort().join(':::');
        if (!pairMap.has(pairKey)) pairMap.set(pairKey, []);
        pairMap.get(pairKey).push(e);
    });

    pairMap.forEach(edges => {
        edges.forEach((e, idx) => {
            const lbl = `${e.port ? '[' + escapeXml(e.port) + ']&#xa;' : ''}${escapeXml(e.flow || '')}`;
            const exitY = edges.length === 1 ? 0.5 : (idx + 1) / (edges.length + 1);
            const entryY = exitY;
            const style = `edgeStyle=orthogonalEdgeStyle;curved=1;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${edgeCol};fontColor=${textCol};labelBackgroundColor=${nodeCol};endArrow=block;endFill=1;exitX=1;exitY=${exitY};entryX=0;entryY=${entryY};`;

            cells += `
          <mxCell id="${e.id}" value="${lbl}" style="${style}" edge="1" parent="1" source="${e.from}" target="${e.to}">
            <mxGeometry relative="1" as="geometry" />
          </mxCell>`;
        });
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" type="device">
  <diagram id="net-map" name="Topology">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" background="${bgCol}">
      <root>${cells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    downloadBlob(xml, 'network_topology.drawio', 'application/vnd.jgraph.mxfile');
};

// ==========================================
// TOUCH GESTURES (PAN & PINCH-TO-ZOOM)
// ==========================================
let touchStartDist = 0;
let touchStartScale = 1;
let touchStartCenter = { x: 0, y: 0 };

function getTouchDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

function getTouchCenter(t1, t2) {
    return {
        x: (t1.clientX + t2.clientX) / 2 - container.offsetLeft,
        y: (t1.clientY + t2.clientY) / 2 - container.offsetTop
    };
}

container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        if (e.target === container || e.target === viewport || e.target === edgesLayer) {
            state.isPanning = true;
            state.startPan = {
                x: e.touches[0].clientX - state.pan.x,
                y: e.touches[0].clientY - state.pan.y
            };
            clearSelection();
        }
    } else if (e.touches.length === 2) {
        state.isPanning = false;
        touchStartDist = getTouchDist(e.touches[0], e.touches[1]);
        touchStartScale = state.scale;
        touchStartCenter = getTouchCenter(e.touches[0], e.touches[1]);
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && state.isPanning) {
        state.pan.x = e.touches[0].clientX - state.startPan.x;
        state.pan.y = e.touches[0].clientY - state.startPan.y;
        updateTransform();
    } else if (e.touches.length === 2 && touchStartDist > 0) {
        e.preventDefault();
        const currentDist = getTouchDist(e.touches[0], e.touches[1]);
        const factor = currentDist / touchStartDist;
        const newScale = Math.min(3, Math.max(0.2, touchStartScale * factor));

        const prevScale = state.scale;
        state.scale = newScale;
        state.pan.x = touchStartCenter.x - (touchStartCenter.x - state.pan.x) * (state.scale / prevScale);
        state.pan.y = touchStartCenter.y - (touchStartCenter.y - state.pan.y) * (state.scale / prevScale);

        updateTransform();
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        if (state.isPanning) {
            state.isPanning = false;
            scheduleSave();
        }
        if (touchStartDist > 0) {
            touchStartDist = 0;
            scheduleSave();
        }
    } else if (e.touches.length === 1) {
        touchStartDist = 0;
    }
});

// ==========================================
// SHARE VIA URL (DEFLATE + URL-SAFE BASE64)
// ==========================================

function uint8ArrayToBase64(bytes) {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function compressStateToHash(dataObj) {
    const jsonStr = JSON.stringify(dataObj);
    const byteArray = new TextEncoder().encode(jsonStr);

    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(byteArray);
    writer.close();

    const buffer = await new Response(cs.readable).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    return uint8ArrayToBase64(bytes)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function decompressHashToState(hashStr) {
    try {
        let base64 = hashStr.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';

        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();

        const buffer = await new Response(ds.readable).arrayBuffer();
        const jsonStr = new TextDecoder().decode(buffer);
        return JSON.parse(jsonStr);
    } catch (err) {
        console.error('Ошибка распаковки схемы из URL:', err);
        return null;
    }
}

document.getElementById('btn-share-url').onclick = async () => {
    const payload = {
        version: 8,
        nodes: state.nodes,
        groups: state.groups,
        edges: state.edges,
        theme: state.theme,
        pan: state.pan,
        scale: state.scale
    };

    try {
        const hash = await compressStateToHash(payload);
        const shareUrl = `${window.location.origin}${window.location.pathname}#map=${hash}`;

        const MAX_SAFE_URL_LENGTH = 2048;

        if (shareUrl.length > MAX_SAFE_URL_LENGTH) {
            const kbSize = (shareUrl.length / 1024).toFixed(1);
            const shouldSaveJson = confirm(
                `⚠️ Схема слишком большая для ссылки (${kbSize} КБ при безопасном лимите ~2 КБ).\n\n` +
                `• «ОК» — скачать файл JSON для надёжной передачи.\n` +
                `• «Отмена» — Всё равно скопировать ссылку в буфер обмена.\n\n` +
                `* Длинная ссылка может обрезаться в мессенджерах или почте.\n` +
                `** Её можно сжать через URL shortener, но это раскроет данные стороннему сервису.`
            );

            if (shouldSaveJson) {
                document.getElementById('btn-save-json').click();
                return;
            }
        }

        await navigator.clipboard.writeText(shareUrl);
        window.history.replaceState(null, '', `#map=${hash}`);

        const shareIcon = document.getElementById('btn-share-icon');
        const shareText = document.getElementById('btn-share-text');
        if (shareIcon) shareIcon.innerText = '✅';
        if (shareText) shareText.innerText = ' Скопировано';

        setTimeout(() => {
            if (shareIcon) shareIcon.innerText = '🔗';
            if (shareText) shareText.innerText = ' Ссылка';
        }, 2000);
    } catch (e) {
        alert('Не удалось сформировать ссылку: ' + e.message);
    }
};

function applyNewState(newState) {
    domNodes.forEach(el => el.remove());
    domNodes.clear();
    domGroups.forEach(el => el.remove());
    domGroups.clear();

    state.nodes = newState.nodes || [];
    state.groups = newState.groups || [];
    state.edges = newState.edges || [];
    state.pan = newState.pan || { x: 0, y: 0 };
    state.scale = newState.scale || 1;

    if (newState.theme) {
        applyTheme(newState.theme);
    }

    clearSelection();
    updateTransform();
    render();
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ (ПРИОРИТЕТ: URL -> LOCALSTORAGE -> DEMO)
// ==========================================
async function startApp() {
    const hash = window.location.hash;

    if (hash && hash.startsWith('#map=')) {
        const hashData = hash.substring(5);
        const parsedState = await decompressHashToState(hashData);
        if (parsedState && Array.isArray(parsedState.nodes)) {
            applyNewState(parsedState);
            scheduleSave();
            return;
        }
    }

    if (loadSavedState()) {
        updateTransform();
        render();
        return;
    }

    state.nodes = [];
    state.groups = [];
    state.edges = [];
    initDemo();
    applyTheme('light');
    updateTransform();
    render();
}

startApp();