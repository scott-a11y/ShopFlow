// ShopFlow - Door Production Tool
let DB = null;
let parts = [];
let zoomLevel = 1;
let showDimensions = true;
let measureMode = false;
let measureStart = null;
let selectedHingeOID = null;
let canvas, ctx;
let displayUnits = 'fraction';
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let previewTransform = {};

document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('preview');
    ctx = canvas.getContext('2d');
    document.getElementById('job-date').valueAsDate = new Date();
    
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    await loadDatabase();
    initUI();
    renderParts();
});

function setupCanvas() {
    const container = document.getElementById('preview-container');
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPreview();
}

function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (measureMode) {
        doMeasure(x, y);
    } else {
        isPanning = true;
        panStart = { x: x - panOffset.x, y: y - panOffset.y };
        canvas.style.cursor = 'grabbing';
    }
}

function onMouseMove(e) {
    if (!isPanning) return;
    const rect = canvas.getBoundingClientRect();
    panOffset.x = e.clientX - rect.left - panStart.x;
    panOffset.y = e.clientY - rect.top - panStart.y;
    drawPreview();
}

function onMouseUp() {
    isPanning = false;
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
}

function onWheel(e) {
    e.preventDefault();
    zoomLevel *= e.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel = Math.max(0.25, Math.min(5, zoomLevel));
    drawPreview();
}

function doMeasure(x, y) {
    const t = previewTransform;
    if (!t.scale) return;
    
    // Convert screen coords to part coords
    let px = (x - t.ox) / t.scale;
    let py = t.ph - (y - t.oy) / t.scale;
    
    // Get current part and holes
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (!part) return;
    
    const hingeSide = part.hingeSide || document.getElementById('hinge-side').value;
    const hingeCount = parseInt(document.getElementById('hinge-count').value) || 2;
    const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount) : [];
    
    // Snap detection
    const snapResult = findSnapPoint(px, py, part, holes);
    px = snapResult.x;
    py = snapResult.y;
    
    if (!measureStart) {
        measureStart = { 
            x: px, y: py, 
            type: snapResult.type,
            label: snapResult.label
        };
        document.getElementById('btn-measure').textContent = '📏 End Pt';
        document.getElementById('measure-result').innerHTML = 
            '<span style="color:#22d3ee">⊙ ' + snapResult.label + '</span> → Click second point...';
    } else {
        const dx = px - measureStart.x;
        const dy = py - measureStart.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        measureStart.endX = px;
        measureStart.endY = py;
        measureStart.endType = snapResult.type;
        measureStart.endLabel = snapResult.label;
        measureStart.dist = dist;
        
        document.getElementById('measure-result').innerHTML = 
            '<span style="color:#22d3ee">⊙ ' + measureStart.label + '</span> → ' +
            '<span style="color:#a855f7">⊙ ' + snapResult.label + '</span><br>' +
            '<b style="font-size:14px">Distance: ' + formatDim(dist) + ' (' + (dist*25.4).toFixed(2) + 'mm)</b> | ' +
            'ΔX: ' + formatDim(Math.abs(dx)) + ' | ΔY: ' + formatDim(Math.abs(dy));
        
        drawPreview();
        
        // Reset after 8 seconds
        setTimeout(() => {
            measureStart = null;
            measureMode = false;
            document.getElementById('btn-measure').textContent = '📏 Measure';
            document.getElementById('btn-measure').classList.remove('active');
            canvas.style.cursor = 'grab';
            document.getElementById('measure-result').textContent = 'Drag to pan • Scroll to zoom';
            drawPreview();
        }, 8000);
        return;
    }
    drawPreview();
}

function findSnapPoint(px, py, part, holes) {
    const snapRadius = 2.0; // inches
    let best = { x: px, y: py, dist: Infinity, type: 'free', label: formatDim(px) + ', ' + formatDim(py) };
    
    // Priority 1: Hole centers (cups get higher priority than pilots)
    holes.filter(h => h.isCup).forEach(h => {
        const dist = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
        if (dist < best.dist && dist < snapRadius) {
            best = { x: h.x, y: h.y, dist: dist, type: 'cup', 
                label: 'Cup @ ' + formatDim(h.x) + ', ' + formatDim(h.y) };
        }
    });
    
    // Priority 2: Pilot holes
    if (best.type === 'free') {
        holes.filter(h => !h.isCup).forEach(h => {
            const dist = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
            if (dist < best.dist && dist < snapRadius) {
                best = { x: h.x, y: h.y, dist: dist, type: 'pilot',
                    label: 'Pilot @ ' + formatDim(h.x) + ', ' + formatDim(h.y) };
            }
        });
    }
    
    // Priority 3: Corners
    if (best.type === 'free') {
        const corners = [
            { x: 0, y: 0, label: 'Corner (BL)' },
            { x: part.width, y: 0, label: 'Corner (BR)' },
            { x: 0, y: part.height, label: 'Corner (TL)' },
            { x: part.width, y: part.height, label: 'Corner (TR)' }
        ];
        corners.forEach(c => {
            const dist = Math.sqrt(Math.pow(px - c.x, 2) + Math.pow(py - c.y, 2));
            if (dist < best.dist && dist < snapRadius) {
                best = { x: c.x, y: c.y, dist: dist, type: 'corner', label: c.label };
            }
        });
    }
    
    // Priority 4: Edges
    if (best.type === 'free') {
        // Left edge
        if (px < snapRadius && py >= 0 && py <= part.height) {
            const dist = Math.abs(px);
            if (dist < best.dist) {
                const edgeY = Math.max(0, Math.min(part.height, py));
                best = { x: 0, y: edgeY, dist: dist, type: 'edge',
                    label: 'Left Edge @ Y=' + formatDim(edgeY) };
            }
        }
        // Right edge
        if (part.width - px < snapRadius && py >= 0 && py <= part.height) {
            const dist = Math.abs(part.width - px);
            if (dist < best.dist) {
                const edgeY = Math.max(0, Math.min(part.height, py));
                best = { x: part.width, y: edgeY, dist: dist, type: 'edge',
                    label: 'Right Edge @ Y=' + formatDim(edgeY) };
            }
        }
        // Bottom edge
        if (py < snapRadius && px >= 0 && px <= part.width) {
            const dist = Math.abs(py);
            if (dist < best.dist) {
                const edgeX = Math.max(0, Math.min(part.width, px));
                best = { x: edgeX, y: 0, dist: dist, type: 'edge',
                    label: 'Bottom Edge @ X=' + formatDim(edgeX) };
            }
        }
        // Top edge
        if (part.height - py < snapRadius && px >= 0 && px <= part.width) {
            const dist = Math.abs(part.height - py);
            if (dist < best.dist) {
                const edgeX = Math.max(0, Math.min(part.width, px));
                best = { x: edgeX, y: part.height, dist: dist, type: 'edge',
                    label: 'Top Edge @ X=' + formatDim(edgeX) };
            }
        }
    }
    
    return best;
}

async function loadDatabase() {
    try {
        const resp = await fetch('data/CabinetSenseDB_combined.json');
        DB = (await resp.json()).tables;
        document.getElementById('db-info').textContent = 
            (DB.Hole?.length || 0) + ' holes | ' + (DB.Part?.length || 0) + ' parts';
        populateHinges();
        populateTemplates();
    } catch (err) {
        console.error('DB Error:', err);
        document.getElementById('db-info').textContent = 'DB Load Error';
    }
}

function populateHinges() {
    const list = document.getElementById('hinge-list');
    const hasHoles = new Set((DB.Hole || []).map(h => String(h.OIDPart)));
    const hinges = (DB.Part || []).filter(p => 
        (p.Class === '28' || p.Class === '15') && hasHoles.has(String(p.OID))
    );
    
    let html = '<div class="hardware-group">Door Hinges</div>';
    hinges.filter(h => h.Class === '28').forEach(h => {
        html += '<div class="hardware-item" data-oid="' + h.OID + '" onclick="selectHinge(\'' + h.OID + '\')">' +
            '<div class="name">' + (h.Name || 'Hinge') + '</div></div>';
    });
    
    html += '<div class="hardware-group">Clips</div>';
    hinges.filter(h => h.Class === '15').forEach(h => {
        html += '<div class="hardware-item" data-oid="' + h.OID + '" onclick="selectHinge(\'' + h.OID + '\')">' +
            '<div class="name">' + (h.Name || 'Clip') + '</div></div>';
    });
    
    list.innerHTML = html;
    const first = hinges.find(h => h.Class === '28');
    if (first) selectHinge(first.OID);
}

function selectHinge(oid) {
    selectedHingeOID = String(oid);
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.oid === selectedHingeOID);
    });
    drawPreview();
}

function populateTemplates() {
    const sel = document.getElementById('hinge-template');
    if (!DB.Hinging) return;
    sel.innerHTML = DB.Hinging.map(t => 
        '<option value="' + t.OID + '">' + t.Template + '</option>'
    ).join('');
}

function initUI() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        };
    });
    canvas.style.cursor = 'grab';
}

function filterHardware(type) {
    const q = document.getElementById(type + '-search').value.toLowerCase();
    document.querySelectorAll('#' + type + '-list .hardware-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

// PARTS
function renderParts() {
    const tbody = document.getElementById('parts-tbody');
    tbody.innerHTML = parts.map(p => 
        '<tr>' +
        '<td><input type="checkbox" ' + (p.selected !== false ? 'checked' : '') + ' onchange="togglePart(' + p.id + ')"></td>' +
        '<td><input value="' + p.name + '" onchange="updatePart(' + p.id + ',\'name\',this.value)"></td>' +
        '<td><input value="' + formatDim(p.width) + '" onchange="updatePart(' + p.id + ',\'width\',parseDim(this.value))"></td>' +
        '<td><input value="' + formatDim(p.height) + '" onchange="updatePart(' + p.id + ',\'height\',parseDim(this.value))"></td>' +
        '<td><select onchange="updatePart(' + p.id + ',\'type\',this.value)">' +
            '<option' + (p.type === 'door' ? ' selected' : '') + '>door</option>' +
            '<option' + (p.type === 'drawer' ? ' selected' : '') + '>drawer</option></select></td>' +
        '<td><select onchange="updatePart(' + p.id + ',\'hingeSide\',this.value)">' +
            '<option value="left"' + (p.hingeSide === 'left' ? ' selected' : '') + '>L</option>' +
            '<option value="right"' + (p.hingeSide === 'right' ? ' selected' : '') + '>R</option>' +
            '<option value="both"' + (p.hingeSide === 'both' ? ' selected' : '') + '>LR</option>' +
            '<option value="top"' + (p.hingeSide === 'top' ? ' selected' : '') + '>T</option>' +
            '<option value="bottom"' + (p.hingeSide === 'bottom' ? ' selected' : '') + '>B</option></select></td>' +
        '<td><button class="btn-delete" onclick="removePart(' + p.id + ')">×</button></td>' +
        '</tr>'
    ).join('');
    
    updateStats();
    updatePreviewSelect();
    drawPreview();
}

function addPart() {
    const id = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    const side = document.getElementById('hinge-side').value || 'left';
    parts.push({ id: id, name: 'Door ' + id, width: 15, height: 30, type: 'door', hingeSide: side, selected: true });
    renderParts();
}

function removePart(id) {
    parts = parts.filter(p => p.id !== id);
    renderParts();
}

function togglePart(id) {
    const p = parts.find(x => x.id === id);
    if (p) p.selected = !p.selected;
}

function updatePart(id, field, value) {
    const p = parts.find(x => x.id === id);
    if (p) {
        p[field] = value;
        updateStats();
        drawPreview();
    }
}

function clearAllParts() {
    if (!parts.length || confirm('Clear all parts?')) {
        parts = [];
        renderParts();
    }
}

function updateStats() {
    const doors = parts.filter(p => p.type === 'door').length;
    const drawers = parts.filter(p => p.type === 'drawer').length;
    const sqft = parts.reduce((s, p) => s + (p.width * p.height) / 144, 0);
    const sheetSize = parseFloat(document.getElementById('sheet-size').value) || 32;
    const sheets = Math.ceil(sqft * 1.15 / sheetSize);
    
    document.getElementById('stat-parts').textContent = parts.length;
    document.getElementById('stat-doors').textContent = doors;
    document.getElementById('stat-drawers').textContent = drawers;
    document.getElementById('stat-sqft').textContent = sqft.toFixed(1);
    document.getElementById('stat-sheets').textContent = sheets;
}

function updatePreviewSelect() {
    const sel = document.getElementById('preview-select');
    if (parts.length) {
        sel.innerHTML = parts.map(p => 
            '<option value="' + p.id + '">' + p.name + ' (' + formatDim(p.width) + ' x ' + formatDim(p.height) + ')</option>'
        ).join('');
    } else {
        sel.innerHTML = '<option>Add parts first</option>';
    }
}

function updatePreview() { drawPreview(); }

function updateUnits() {
    displayUnits = document.getElementById('display-units').value;
    renderParts();
}

function updateHingeTemplate() {
    drawPreview();
}

// CSV
function showImportModal() { document.getElementById('import-modal').style.display = 'flex'; }
function hideImportModal() { document.getElementById('import-modal').style.display = 'none'; }

function loadCSVFile(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => { document.getElementById('csv-input').value = ev.target.result; };
        reader.readAsText(file);
    }
}

function importCSV() {
    const text = document.getElementById('csv-input').value.trim();
    if (!text) return;
    
    const lines = text.split('\n').filter(l => l.trim());
    let nextId = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    
    lines.forEach((line, i) => {
        if (i === 0 && line.toLowerCase().includes('name')) return;
        const cols = line.split(/[,\t]/).map(c => c.trim());
        if (cols.length >= 3) {
            const w = parseDim(cols[1]);
            const h = parseDim(cols[2]);
            if (w > 0 && h > 0) {
                parts.push({
                    id: nextId++,
                    name: cols[0] || 'Part',
                    width: w,
                    height: h,
                    type: (cols[3] || '').toLowerCase().includes('drawer') ? 'drawer' : 'door',
                    hingeSide: (cols[4] || 'left').toLowerCase(),
                    selected: true
                });
            }
        }
    });
    
    renderParts();
    hideImportModal();
    document.getElementById('csv-input').value = '';
}

// JOB SAVE/LOAD
function saveJob() {
    const data = {
        jobNumber: document.getElementById('job-number').value,
        customer: document.getElementById('customer-name').value,
        date: document.getElementById('job-date').value,
        notes: document.getElementById('job-notes').value,
        hingeOID: selectedHingeOID,
        hingeSide: document.getElementById('hinge-side').value,
        hingeCount: document.getElementById('hinge-count').value,
        bottomHinge: document.getElementById('bottom-hinge').value,
        topHinge: document.getElementById('top-hinge').value,
        displayUnits: displayUnits,
        parts: parts
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data.jobNumber || 'job') + '_' + (data.customer || 'customer') + '.json';
    a.click();
}

function loadJob() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const data = JSON.parse(ev.target.result);
                    document.getElementById('job-number').value = data.jobNumber || '';
                    document.getElementById('customer-name').value = data.customer || '';
                    document.getElementById('job-date').value = data.date || '';
                    document.getElementById('job-notes').value = data.notes || '';
                    if (data.hingeOID) selectHinge(data.hingeOID);
                    if (data.hingeSide) document.getElementById('hinge-side').value = data.hingeSide;
                    if (data.hingeCount) document.getElementById('hinge-count').value = data.hingeCount;
                    if (data.bottomHinge) document.getElementById('bottom-hinge').value = data.bottomHinge;
                    if (data.topHinge) document.getElementById('top-hinge').value = data.topHinge;
                    if (data.displayUnits) {
                        displayUnits = data.displayUnits;
                        document.getElementById('display-units').value = displayUnits;
                    }
                    parts = data.parts || [];
                    renderParts();
                } catch (err) {
                    alert('Invalid job file');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

function printCutList() {
    const job = document.getElementById('job-number').value;
    const cust = document.getElementById('customer-name').value;
    const date = document.getElementById('job-date').value;
    const notes = document.getElementById('job-notes').value;
    const sqft = parts.reduce((s, p) => s + (p.width * p.height) / 144, 0);
    
    let html = '<!DOCTYPE html><html><head><title>Cut List</title><style>' +
        'body{font-family:Arial,sans-serif;padding:20px}' +
        'table{width:100%;border-collapse:collapse}' +
        'th,td{border:1px solid #ccc;padding:6px;text-align:left}' +
        'th{background:#f5f5f5}' +
        '</style></head><body>' +
        '<h2>Cut List: ' + job + '</h2>' +
        '<p><b>Customer:</b> ' + cust + ' | <b>Date:</b> ' + date + '</p>' +
        (notes ? '<p><b>Notes:</b> ' + notes + '</p>' : '') +
        '<table><tr><th>#</th><th>Name</th><th>W</th><th>H</th><th>Type</th><th>Side</th></tr>';
    
    parts.forEach((p, i) => {
        html += '<tr><td>' + (i+1) + '</td><td>' + p.name + '</td><td>' + formatDim(p.width) + 
            '</td><td>' + formatDim(p.height) + '</td><td>' + p.type + '</td><td>' + p.hingeSide + '</td></tr>';
    });
    
    html += '</table><p><b>Total:</b> ' + parts.length + ' parts | ' + sqft.toFixed(1) + ' sq ft</p></body></html>';
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// PREVIEW DRAWING
function drawPreview() {
    if (!ctx || !canvas) return;
    
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    
    if (W <= 0 || H <= 0) return;
    
    // Clear
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, H);
    
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (!part) {
        ctx.fillStyle = '#64748b';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Add parts to see preview', W / 2, H / 2);
        return;
    }
    
    // Calculate scale and position
    const pad = 80;
    const scale = Math.min((W - pad * 2) / part.width, (H - pad * 2) / part.height) * zoomLevel;
    const pw = part.width * scale;
    const ph = part.height * scale;
    const ox = (W - pw) / 2 + panOffset.x;
    const oy = (H - ph) / 2 + panOffset.y;
    
    previewTransform = { scale: scale, ox: ox, oy: oy, pw: part.width, ph: part.height };
    
    // Draw part (wood color)
    ctx.fillStyle = '#c4956a';
    ctx.fillRect(ox, oy, pw, ph);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, pw, ph);
    
    // Get hinge holes
    const hingeSide = part.hingeSide || document.getElementById('hinge-side').value;
    const hingeCount = parseInt(document.getElementById('hinge-count').value) || 2;
    const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount) : [];
    
    // Draw holes
    holes.forEach(h => {
        const hx = ox + h.x * scale;
        const hy = oy + (part.height - h.y) * scale;
        const r = Math.max(h.dia / 2 * scale, 3);
        
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = h.isCup ? '#dc2626' : '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    
    // Dimensions and door name
    if (showDimensions) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatDim(part.width), ox + pw / 2, oy - 15);
        
        ctx.save();
        ctx.translate(ox - 20, oy + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatDim(part.height), 0, 0);
        ctx.restore();
        
        // LARGE door name in center
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(part.name, ox + pw / 2, oy + ph / 2 - 10);
        
        // Part dimensions below name
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(formatDim(part.width) + ' x ' + formatDim(part.height), ox + pw / 2, oy + ph / 2 + 10);
        
        // Hinge side label
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fbbf24';
        if (hingeSide === 'left' || hingeSide === 'both') {
            ctx.textAlign = 'left';
            ctx.fillText('◀ HINGE', ox + 5, oy + ph / 2);
        }
        if (hingeSide === 'right' || hingeSide === 'both') {
            ctx.textAlign = 'right';
            ctx.fillText('HINGE ▶', ox + pw - 5, oy + ph / 2);
        }
        if (hingeSide === 'top') {
            ctx.textAlign = 'center';
            ctx.fillText('▲ HINGE', ox + pw / 2, oy + 15);
        }
        if (hingeSide === 'bottom') {
            ctx.textAlign = 'center';
            ctx.fillText('HINGE ▼', ox + pw / 2, oy + ph - 8);
        }
    }
    
    // Draw measurement line if active
    if (measureStart) {
        const sx = ox + measureStart.x * scale;
        const sy = oy + (part.height - measureStart.y) * scale;
        
        // Start point color based on type
        const startColor = measureStart.type === 'cup' ? '#dc2626' : 
                          measureStart.type === 'pilot' ? '#22c55e' : 
                          measureStart.type === 'corner' ? '#f59e0b' : '#06b6d4';
        
        // Start point with glow
        ctx.shadowColor = startColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fillStyle = startColor;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Start label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('1', sx, sy + 3);
        
        // If we have end point, draw line and end point
        if (measureStart.endX !== undefined) {
            const ex = ox + measureStart.endX * scale;
            const ey = oy + (part.height - measureStart.endY) * scale;
            
            const endColor = measureStart.endType === 'cup' ? '#dc2626' : 
                            measureStart.endType === 'pilot' ? '#22c55e' : 
                            measureStart.endType === 'corner' ? '#f59e0b' : '#a855f7';
            
            // Measurement line
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // End point with glow
            ctx.shadowColor = endColor;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(ex, ey, 8, 0, Math.PI * 2);
            ctx.fillStyle = endColor;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // End label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('2', ex, ey + 3);
            
            // Distance label at midpoint
            const mx = (sx + ex) / 2;
            const my = (sy + ey) / 2;
            const distText = (measureStart.dist * 25.4).toFixed(2) + ' mm';
            const inchText = formatDim(measureStart.dist);
            
            // Background pill
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            const pillW = 120, pillH = 40;
            ctx.beginPath();
            ctx.roundRect(mx - pillW/2, my - pillH/2, pillW, pillH, 6);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Distance text
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(distText, mx, my - 5);
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(inchText, mx, my + 12);
        }
    }
    
    // Legend
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, H - 30, W, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Zoom: ' + Math.round(zoomLevel * 100) + '%', 10, H - 10);
    
    ctx.beginPath();
    ctx.arc(100, H - 15, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('Cup', 110, H - 10);
    
    ctx.beginPath();
    ctx.arc(160, H - 15, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('Pilot', 170, H - 10);
}

function getHingeHoles(part, hingeSide, hingeCount) {
    const holes = [];
    const cupD = 35 / 25.4;    // 35mm cup diameter
    const pilotD = 8 / 25.4;   // 8mm pilot diameter
    const pilotOffset = 22.5 / 25.4;  // Pilot offset from cup center
    
    // Get inset positions from inputs
    const bottomInset = parseDim(document.getElementById('bottom-hinge').value) || 3;
    const topInset = parseDim(document.getElementById('top-hinge').value) || 3;
    
    // Check if horizontal (top/bottom) or vertical (left/right) hinges
    const isHorizontal = (hingeSide === 'top' || hingeSide === 'bottom');
    
    if (isHorizontal) {
        // Horizontal hinges (top or bottom of door)
        const cupY = 22.5 / 25.4;  // Cup setback from edge
        const pilotY = 32 / 25.4;  // Pilot setback from edge
        
        // X positions for hinges along width
        const leftX = bottomInset;  // Using bottomInset as left inset
        const rightX = part.width - topInset;  // Using topInset as right inset
        let xPos = [leftX, rightX];
        
        if (hingeCount >= 3) {
            xPos.push((leftX + rightX) / 2);
        }
        if (hingeCount >= 4) {
            const span = rightX - leftX;
            xPos = [leftX, leftX + span/3, leftX + span*2/3, rightX];
        }
        
        const edgeY = hingeSide === 'top' ? part.height : 0;
        const cupYPos = hingeSide === 'top' ? part.height - cupY : cupY;
        const pilotYPos = hingeSide === 'top' ? part.height - pilotY : pilotY;
        
        xPos.forEach(x => {
            holes.push({ x: x, y: cupYPos, dia: cupD, isCup: true });
            holes.push({ x: x - pilotOffset, y: pilotYPos, dia: pilotD, isCup: false });
            holes.push({ x: x + pilotOffset, y: pilotYPos, dia: pilotD, isCup: false });
        });
    } else {
        // Vertical hinges (left/right side of door)
        const cupX = 22.5 / 25.4;  // Cup setback from edge
        const pilotX = 32 / 25.4;  // Pilot setback from edge
        
        // Y positions based on hinge count
        const bottomY = bottomInset;
        const topY = part.height - topInset;
        let yPos = [bottomY, topY];
        
        if (hingeCount >= 3) {
            yPos.push((bottomY + topY) / 2);
        }
        if (hingeCount >= 4) {
            const span = topY - bottomY;
            yPos = [bottomY, bottomY + span/3, bottomY + span*2/3, topY];
        }
        
        const sides = hingeSide === 'both' ? ['left', 'right'] : [hingeSide];
        
        sides.forEach(side => {
            yPos.forEach(y => {
                const cx = side === 'right' ? part.width - cupX : cupX;
                const px = side === 'right' ? part.width - pilotX : pilotX;
                
                holes.push({ x: cx, y: y, dia: cupD, isCup: true });
                holes.push({ x: px, y: y - pilotOffset, dia: pilotD, isCup: false });
                holes.push({ x: px, y: y + pilotOffset, dia: pilotD, isCup: false });
            });
        });
    }
    
    return holes;
}

// CONTROLS
function toggleDimensions() {
    showDimensions = !showDimensions;
    document.getElementById('btn-dimensions').classList.toggle('active', showDimensions);
    drawPreview();
}

function toggleMeasure() {
    measureMode = !measureMode;
    measureStart = null;
    document.getElementById('btn-measure').classList.toggle('active', measureMode);
    document.getElementById('measure-result').textContent = measureMode ? 'Click first point...' : 'Drag to pan • Scroll to zoom';
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
}

function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 5); drawPreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.25); drawPreview(); }
function resetZoom() { zoomLevel = 1; panOffset = { x: 0, y: 0 }; drawPreview(); }

// FORMATTING
function formatDim(inches) {
    if (!inches || isNaN(inches)) return '0';
    if (displayUnits === 'metric') return (inches * 25.4).toFixed(1) + 'mm';
    if (displayUnits === 'decimal') return inches.toFixed(2) + '"';
    
    // Fractions
    const whole = Math.floor(inches);
    const frac = inches - whole;
    if (frac < 0.03) return whole + '"';
    
    const fracs = [[1/16,'1/16'],[1/8,'1/8'],[3/16,'3/16'],[1/4,'1/4'],[5/16,'5/16'],[3/8,'3/8'],[7/16,'7/16'],[1/2,'1/2'],[9/16,'9/16'],[5/8,'5/8'],[11/16,'11/16'],[3/4,'3/4'],[13/16,'13/16'],[7/8,'7/8'],[15/16,'15/16']];
    let best = fracs[0];
    for (const f of fracs) {
        if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
    }
    return whole ? whole + '-' + best[1] + '"' : best[1] + '"';
}

function parseDim(s) {
    if (!s) return 0;
    s = String(s).trim().replace(/"/g, '');
    if (s.toLowerCase().includes('mm')) return parseFloat(s) / 25.4;
    if (s.includes('-') && s.includes('/')) {
        const parts = s.split('-');
        const frac = parts[1].split('/');
        return parseInt(parts[0]) + parseFloat(frac[0]) / parseFloat(frac[1]);
    }
    if (s.includes('/')) {
        const frac = s.split('/');
        return parseFloat(frac[0]) / parseFloat(frac[1]);
    }
    return parseFloat(s) || 0;
}

// DXF EXPORT
function exportSelectedDXF() {
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (part) exportDXF([part]);
}

function exportAllDXF() {
    const sel = parts.filter(p => p.selected !== false);
    if (sel.length) exportDXF(sel);
    else alert('No parts selected');
}

function exportDXF(list) {
    const job = document.getElementById('job-number').value || 'job';
    const hingeCount = parseInt(document.getElementById('hinge-count').value) || 2;
    
    list.forEach(part => {
        const hingeSide = part.hingeSide || 'left';
        const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount) : [];
        
        let dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
        ['Outline', 'Cup_35mm', 'Pilot_8mm'].forEach(n => {
            dxf += '0\nLAYER\n2\n' + n + '\n70\n0\n62\n7\n6\nCONTINUOUS\n';
        });
        dxf += '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
        
        // Outline
        dxf += '0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n';
        dxf += '10\n0\n20\n0\n10\n' + part.width + '\n20\n0\n10\n' + part.width + '\n20\n' + part.height + '\n10\n0\n20\n' + part.height + '\n';
        
        // Holes
        holes.forEach(h => {
            const layer = h.isCup ? 'Cup_35mm' : 'Pilot_8mm';
            dxf += '0\nCIRCLE\n8\n' + layer + '\n10\n' + h.x.toFixed(4) + '\n20\n' + h.y.toFixed(4) + '\n40\n' + (h.dia/2).toFixed(4) + '\n';
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        const fn = job + '_' + part.name + '_' + Math.round(part.width) + 'x' + Math.round(part.height) + '.dxf';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
        a.download = fn.replace(/\s+/g, '_');
        a.click();
    });
}
