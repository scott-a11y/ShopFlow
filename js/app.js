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
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update cursor position in measure mode
    if (measureMode) {
        updateCursorPosition(x, y);
    }
    
    if (!isPanning) return;
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
    
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (!part) return;
    
    // Convert screen coords to part coords
    let px = (x - t.ox) / t.scale;
    let py = t.ph - (y - t.oy) / t.scale;
    
    // Get snap point
    const snap = getSnapPoint(px, py, part);
    px = snap.x;
    py = snap.y;
    
    if (!measureStart) {
        // First point
        measureStart = { x: px, y: py, label: snap.label };
        document.getElementById('m-pt1').textContent = 'X: ' + px.toFixed(4) + '  Y: ' + py.toFixed(4);
        document.getElementById('m-pt1').parentElement.querySelector('label').textContent = 'Point 1 (' + snap.label + '):';
        document.getElementById('m-pt2').textContent = '—';
        document.getElementById('m-distance').textContent = '—';
        document.getElementById('m-angle').textContent = '—';
        document.getElementById('m-dx').textContent = '—';
        document.getElementById('m-dy').textContent = '—';
    } else {
        // Second point - calculate all measurements
        measureStart.endX = px;
        measureStart.endY = py;
        measureStart.endLabel = snap.label;
        
        const dx = px - measureStart.x;
        const dy = py - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        measureStart.dist = dist;
        measureStart.angle = angle;
        measureStart.dx = Math.abs(dx);
        measureStart.dy = Math.abs(dy);
        
        // Update panel
        document.getElementById('m-distance').innerHTML = '<b>' + dist.toFixed(4) + '</b> in <span style="color:#888">(' + (dist * 25.4).toFixed(2) + ' mm)</span>';
        document.getElementById('m-angle').textContent = angle.toFixed(3) + '°';
        document.getElementById('m-dx').textContent = Math.abs(dx).toFixed(4) + ' in';
        document.getElementById('m-dy').textContent = Math.abs(dy).toFixed(4) + ' in';
        document.getElementById('m-pt2').textContent = 'X: ' + px.toFixed(4) + '  Y: ' + py.toFixed(4);
        document.getElementById('m-pt2').parentElement.querySelector('label').textContent = 'Point 2 (' + snap.label + '):';
        
        drawPreview();
    }
    drawPreview();
}

function getSnapPoint(px, py, part) {
    const hingeSide = part.hingeSide || document.getElementById('hinge-side').value;
    const hingeCount = parseInt(document.getElementById('hinge-count').value) || 2;
    const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount) : [];
    
    let snapX = px, snapY = py, snapLabel = 'Point';
    
    // Check holes first - 0.5" snap radius
    const holeSnap = 0.5;
    let closestDist = holeSnap;
    
    for (const h of holes) {
        const d = Math.sqrt((px - h.x) ** 2 + (py - h.y) ** 2);
        if (d < closestDist) {
            closestDist = d;
            snapX = h.x;
            snapY = h.y;
            snapLabel = h.isCup ? 'Cup Center' : 'Pilot Center';
        }
    }
    
    // If no hole, check edges - 0.4" snap
    if (snapLabel === 'Point') {
        const edgeSnap = 0.4;
        if (px < edgeSnap && py >= 0 && py <= part.height) {
            snapX = 0; snapLabel = 'Left Edge';
        } else if (px > part.width - edgeSnap && py >= 0 && py <= part.height) {
            snapX = part.width; snapLabel = 'Right Edge';
        } else if (py < edgeSnap && px >= 0 && px <= part.width) {
            snapY = 0; snapLabel = 'Bottom Edge';
        } else if (py > part.height - edgeSnap && px >= 0 && px <= part.width) {
            snapY = part.height; snapLabel = 'Top Edge';
        }
    }
    
    // Update snap indicator
    document.getElementById('m-snap').textContent = snapLabel;
    
    return { x: snapX, y: snapY, label: snapLabel };
}

function updateCursorPosition(screenX, screenY) {
    const t = previewTransform;
    if (!t.scale) return;
    
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (!part) return;
    
    // Convert to part coords
    const px = (screenX - t.ox) / t.scale;
    const py = t.ph - (screenY - t.oy) / t.scale;
    
    // Get snap info
    const snap = getSnapPoint(px, py, part);
    
    document.getElementById('m-cursor').textContent = 'X: ' + snap.x.toFixed(4) + '  Y: ' + snap.y.toFixed(4);
}

function closeMeasurePanel() {
    measureMode = false;
    measureStart = null;
    document.getElementById('measure-panel').style.display = 'none';
    document.getElementById('btn-measure').classList.remove('active');
    document.getElementById('btn-measure').textContent = '📏 Measure';
    canvas.style.cursor = 'grab';
    drawPreview();
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
    const profile = document.getElementById('profile-tool').value || 'Fast Cut';
    parts.push({ id: id, name: 'Door ' + id, width: 15, height: 30, type: 'door', hingeSide: side, profileTool: profile, selected: true });
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
        profileTool: document.getElementById('profile-tool').value,
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
                    if (data.profileTool) document.getElementById('profile-tool').value = data.profileTool;
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
    
    // Draw measurement line if active (Cabinet Vision style - thin red dashed)
    if (measureStart) {
        const sx = ox + measureStart.x * scale;
        const sy = oy + (part.height - measureStart.y) * scale;
        
        // Start point - small red crosshair
        ctx.strokeStyle = '#cc0000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy);
        ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6);
        ctx.stroke();
        
        // If we have end point
        if (measureStart.endX !== undefined) {
            const ex = ox + measureStart.endX * scale;
            const ey = oy + (part.height - measureStart.endY) * scale;
            
            // Thin red dashed line
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = '#cc0000';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // End point - small red crosshair
            ctx.beginPath();
            ctx.moveTo(ex - 6, ey); ctx.lineTo(ex + 6, ey);
            ctx.moveTo(ex, ey - 6); ctx.lineTo(ex, ey + 6);
            ctx.stroke();
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
        
        // Collect unique drill layers from hole data
        const drillLayers = new Set();
        holes.forEach(h => { if (h.layer) drillLayers.add(h.layer); });
        
        // Get selected profile tool for this part
        const profileTool = part.profileTool || 'Compression 0.5';
        
        // All layers - drilling + selected profile + engraving
        // Layer names match Aspire toolpath template file names
        const layers = [
            // Drilling layers (from hole data)
            ...Array.from(drillLayers).map(name => ({ name: name, color: 1 })),
            
            // Profile layer (selected per-part)
            { name: profileTool, color: 7 },
            
            // Engraving
            { name: 'Pencil', color: 4 }
        ];
        
        // DXF Header
        let dxf = '0\nSECTION\n2\nHEADER\n';
        dxf += '9\n$ACADVER\n1\nAC1015\n';
        dxf += '9\n$INSUNITS\n70\n1\n';
        dxf += '0\nENDSEC\n';
        
        // Tables - Layers
        dxf += '0\nSECTION\n2\nTABLES\n';
        dxf += '0\nTABLE\n2\nLAYER\n70\n' + layers.length + '\n';
        layers.forEach(l => {
            // Color coding: drills=red/green, profile=white/gray, engrave=cyan
            let color = l.color;
            if (l.name.includes('35')) color = 1;      // Red - 35mm
            else if (l.name.includes('8mm')) color = 3; // Green - 8mm
            else if (l.name.includes('5mm')) color = 5; // Blue - 5mm
            dxf += '0\nLAYER\n2\n' + l.name + '\n70\n0\n62\n' + color + '\n6\nCONTINUOUS\n';
        });
        dxf += '0\nENDTAB\n0\nENDSEC\n';
        
        // Entities section
        dxf += '0\nSECTION\n2\nENTITIES\n';
        
        // Profile outline on selected layer only
        const profileLayer = part.profileTool || 'Compression 0.5';
        dxf += '0\nLWPOLYLINE\n8\n' + profileLayer + '\n90\n4\n70\n1\n';
        dxf += '10\n0\n20\n0\n';
        dxf += '10\n' + part.width.toFixed(4) + '\n20\n0\n';
        dxf += '10\n' + part.width.toFixed(4) + '\n20\n' + part.height.toFixed(4) + '\n';
        dxf += '10\n0\n20\n' + part.height.toFixed(4) + '\n';
        
        // Holes on their data-driven layers
        holes.forEach(h => {
            const layer = h.layer || 'Drill 8mm';
            dxf += '0\nCIRCLE\n8\n' + layer + '\n';
            dxf += '10\n' + h.x.toFixed(4) + '\n20\n' + h.y.toFixed(4) + '\n30\n0\n';
            dxf += '40\n' + (h.dia / 2).toFixed(4) + '\n';
        });
        
        // Vector text labels on Pencil layer
        const cx = part.width / 2;
        const cy = part.height / 2;
        dxf += vectorText(part.name, cx, cy + 0.3, 0.5, 'Pencil');
        
        const sideCode = hingeSide === 'left' ? 'L' : hingeSide === 'right' ? 'R' : 
                        hingeSide === 'both' ? 'LR' : hingeSide === 'top' ? 'T' : 'B';
        dxf += vectorText(sideCode, cx, cy - 0.3, 0.4, 'Pencil');
        
        const dimText = Math.round(part.width * 25.4) + 'x' + Math.round(part.height * 25.4);
        dxf += vectorText(dimText, cx, cy - 0.9, 0.25, 'Pencil');
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        // Download
        const fn = job + '_' + part.name + '_' + sideCode + '.dxf';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
        a.download = fn.replace(/\s+/g, '_');
        a.click();
    });
}
// Stroke font for vector text (simplified block letters)
const STROKE_FONT = {
    'A': [[[0,0],[0.5,1],[1,0]], [[0.2,0.4],[0.8,0.4]]],
    'B': [[[0,0],[0,1],[0.7,1],[1,0.8],[0.7,0.5],[0,0.5]], [[0.7,0.5],[1,0.2],[0.7,0],[0,0]]],
    'C': [[[1,0.2],[0.8,0],[0.2,0],[0,0.2],[0,0.8],[0.2,1],[0.8,1],[1,0.8]]],
    'D': [[[0,0],[0,1],[0.7,1],[1,0.7],[1,0.3],[0.7,0],[0,0]]],
    'E': [[[1,0],[0,0],[0,0.5],[0.7,0.5]], [[0,0.5],[0,1],[1,1]]],
    'F': [[[0,0],[0,1],[1,1]], [[0,0.5],[0.7,0.5]]],
    'G': [[[1,0.8],[0.8,1],[0.2,1],[0,0.8],[0,0.2],[0.2,0],[0.8,0],[1,0.2],[1,0.5],[0.5,0.5]]],
    'H': [[[0,0],[0,1]], [[1,0],[1,1]], [[0,0.5],[1,0.5]]],
    'I': [[[0.3,0],[0.7,0]], [[0.5,0],[0.5,1]], [[0.3,1],[0.7,1]]],
    'J': [[[0,0.2],[0.2,0],[0.6,0],[0.8,0.2],[0.8,1]]],
    'K': [[[0,0],[0,1]], [[1,1],[0,0.5],[1,0]]],
    'L': [[[0,1],[0,0],[1,0]]],
    'M': [[[0,0],[0,1],[0.5,0.5],[1,1],[1,0]]],
    'N': [[[0,0],[0,1],[1,0],[1,1]]],
    'O': [[[0.2,0],[0,0.2],[0,0.8],[0.2,1],[0.8,1],[1,0.8],[1,0.2],[0.8,0],[0.2,0]]],
    'P': [[[0,0],[0,1],[0.7,1],[1,0.8],[1,0.6],[0.7,0.5],[0,0.5]]],
    'R': [[[0,0],[0,1],[0.7,1],[1,0.8],[1,0.6],[0.7,0.5],[0,0.5]], [[0.5,0.5],[1,0]]],
    'S': [[[1,0.8],[0.8,1],[0.2,1],[0,0.8],[0.2,0.5],[0.8,0.5],[1,0.2],[0.8,0],[0.2,0],[0,0.2]]],
    'T': [[[0,1],[1,1]], [[0.5,1],[0.5,0]]],
    'U': [[[0,1],[0,0.2],[0.2,0],[0.8,0],[1,0.2],[1,1]]],
    'V': [[[0,1],[0.5,0],[1,1]]],
    'W': [[[0,1],[0.25,0],[0.5,0.5],[0.75,0],[1,1]]],
    'X': [[[0,0],[1,1]], [[0,1],[1,0]]],
    'Y': [[[0,1],[0.5,0.5],[1,1]], [[0.5,0.5],[0.5,0]]],
    'Z': [[[0,1],[1,1],[0,0],[1,0]]],
    '0': [[[0.2,0],[0,0.2],[0,0.8],[0.2,1],[0.8,1],[1,0.8],[1,0.2],[0.8,0],[0.2,0]]],
    '1': [[[0.3,0.8],[0.5,1],[0.5,0]], [[0.2,0],[0.8,0]]],
    '2': [[[0,0.8],[0.2,1],[0.8,1],[1,0.8],[1,0.6],[0,0],[1,0]]],
    '3': [[[0,0.8],[0.2,1],[0.8,1],[1,0.8],[0.8,0.5],[0.5,0.5]], [[0.8,0.5],[1,0.2],[0.8,0],[0.2,0],[0,0.2]]],
    '4': [[[0.7,0],[0.7,1],[0,0.3],[1,0.3]]],
    '5': [[[1,1],[0,1],[0,0.5],[0.8,0.5],[1,0.3],[0.8,0],[0,0]]],
    '6': [[[1,0.8],[0.8,1],[0.2,1],[0,0.8],[0,0.2],[0.2,0],[0.8,0],[1,0.2],[1,0.4],[0.8,0.5],[0,0.5]]],
    '7': [[[0,1],[1,1],[0.3,0]]],
    '8': [[[0.5,0.5],[0.2,0.5],[0,0.7],[0.2,1],[0.8,1],[1,0.7],[0.8,0.5],[0.2,0.5],[0,0.3],[0.2,0],[0.8,0],[1,0.3],[0.8,0.5]]],
    '9': [[[0,0.2],[0.2,0],[0.8,0],[1,0.2],[1,0.8],[0.8,1],[0.2,1],[0,0.8],[0,0.6],[0.2,0.5],[1,0.5]]],
    'x': [[[0,0],[1,0.6]], [[0,0.6],[1,0]]],
    '-': [[[0.2,0.5],[0.8,0.5]]],
    ' ': []
};

// Generate vector text as DXF polylines (centered)
function vectorText(text, centerX, centerY, height, layer) {
    const charWidth = height * 0.7;
    const spacing = height * 0.2;
    const totalWidth = text.length * charWidth + (text.length - 1) * spacing;
    let startX = centerX - totalWidth / 2;
    let dxf = '';
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i].toUpperCase();
        const strokes = STROKE_FONT[char] || STROKE_FONT[text[i]] || [];
        
        strokes.forEach(stroke => {
            if (stroke.length < 2) return;
            dxf += '0\nLWPOLYLINE\n8\n' + layer + '\n90\n' + stroke.length + '\n70\n0\n';
            stroke.forEach(pt => {
                const px = startX + pt[0] * charWidth;
                const py = centerY + pt[1] * height - height/2;
                dxf += '10\n' + px.toFixed(4) + '\n20\n' + py.toFixed(4) + '\n';
            });
        });
        startX += charWidth + spacing;
    }
    return dxf;
}
