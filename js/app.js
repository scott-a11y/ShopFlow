// ShopFlow - Door Production Tool
// With hinge side selection, improved preview

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
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    await loadDatabase();
    initUI();
    parts = [];
    renderParts();
});

function resizeCanvas() {
    const container = document.getElementById('preview-container');
    if (container && canvas) {
        // Just trigger updatePreview which handles the sizing
        updatePreview();
    }
}

// === MOUSE HANDLERS ===
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (measureMode) {
        handleMeasureClick(x, y);
    } else {
        isPanning = true;
        panStart = { x: x - panOffset.x, y: y - panOffset.y };
        canvas.style.cursor = 'grabbing';
    }
}

function handleMouseMove(e) {
    if (!isPanning) return;
    const rect = canvas.getBoundingClientRect();
    panOffset = { 
        x: e.clientX - rect.left - panStart.x, 
        y: e.clientY - rect.top - panStart.y 
    };
    updatePreview();
}

function handleMouseUp() {
    isPanning = false;
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
}

function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel = Math.max(0.25, Math.min(5, zoomLevel * delta));
    updatePreview();
}

function handleMeasureClick(x, y) {
    const t = previewTransform;
    if (!t.scale) return;
    
    const partX = (x - t.offsetX - panOffset.x) / t.scale;
    const partY = t.partHeight - (y - t.offsetY - panOffset.y) / t.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY };
        document.getElementById('btn-measure').textContent = '📏 End Pt';
        document.getElementById('measure-result').innerHTML = '✓ Start set. Click second point.';
        updatePreview();
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        measureStart.endX = partX;
        measureStart.endY = partY;
        measureStart.distance = dist;
        
        document.getElementById('measure-result').innerHTML = 
            `<b>Distance:</b> ${formatDimension(dist)} (${(dist * 25.4).toFixed(2)}mm) &nbsp;|&nbsp; ` +
            `<b>ΔX:</b> ${formatDimension(Math.abs(dx))} &nbsp;|&nbsp; <b>ΔY:</b> ${formatDimension(Math.abs(dy))}`;
        
        updatePreview();
        setTimeout(() => {
            measureStart = null;
            measureMode = false;
            document.getElementById('btn-measure').textContent = '📏 Measure';
            document.getElementById('btn-measure').classList.remove('active');
            canvas.style.cursor = 'grab';
            updatePreview();
        }, 4000);
    }
}

// === DATABASE ===
async function loadDatabase() {
    try {
        const response = await fetch('data/CabinetSenseDB_combined.json');
        DB = (await response.json()).tables;
        document.getElementById('db-info').textContent = `${DB.Hole?.length || 0} holes | ${DB.Part?.length || 0} parts`;
        populateHardwareLists();
        populateHingeTemplates();
    } catch (error) {
        console.error('DB Error:', error);
        document.getElementById('db-info').textContent = 'DB Error';
    }
}

function parseMM(str) {
    if (!str) return 0;
    str = String(str).replace(/\+?\[.*?\]/g, '').trim();
    if (str.includes('mm')) return parseFloat(str) / 25.4;
    if (str.includes('"')) return parseFloat(str);
    const n = parseFloat(str);
    return isNaN(n) ? 0 : (n > 50 ? n / 25.4 : n);
}

function getHingeHolePattern(oid) {
    if (!DB?.Hole) return null;
    const holes = DB.Hole.filter(h => String(h.OIDPart) === String(oid));
    if (!holes.length) return null;
    return holes.map(h => ({
        x: parseMM(h.XLocation),
        z: parseMM(h.ZLocation),
        dia: parseMM(h.Diameter),
        depth: parseMM(h.Depth)
    }));
}

function getHingeInfo(oid) {
    return DB?.Part?.find(p => String(p.OID) === String(oid));
}

// === HARDWARE LISTS ===
function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    const partsWithHoles = new Set(DB?.Hole?.map(h => String(h.OIDPart)) || []);
    
    const hinges = DB?.Part?.filter(p => 
        ['28', '15'].includes(String(p.Class)) && partsWithHoles.has(String(p.OID))
    ) || [];
    
    let html = '';
    const doorHinges = hinges.filter(h => String(h.Class) === '28');
    if (doorHinges.length) {
        html += '<div class="hardware-group">Door Hinges</div>';
        html += doorHinges.map(h => `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge('${h.OID}')">
            <div class="name">${h.Name || 'Unnamed'}</div>
            <div class="details">${getHingeHolePattern(h.OID)?.length || 0} holes</div>
        </div>`).join('');
    }
    
    const clips = hinges.filter(h => String(h.Class) === '15');
    if (clips.length) {
        html += '<div class="hardware-group">Hinge Clips</div>';
        html += clips.map(h => `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge('${h.OID}')">
            <div class="name">${h.Name || 'Unnamed'}</div>
        </div>`).join('');
    }
    
    hingeList.innerHTML = html || '<div style="padding:8px;color:#888;">No hinges found</div>';
    if (doorHinges.length) selectHinge(doorHinges[0].OID);
    
    // Slides
    const slideList = document.getElementById('slide-list');
    const slides = DB?.Part?.filter(p => String(p.Class) === '25' && partsWithHoles.has(String(p.OID))) || [];
    const byMfr = {};
    slides.forEach(s => {
        let mfr = 'Other';
        ['Blum', 'Hettich', 'Grass', 'Salice', 'KV', 'Hafele'].forEach(m => { if ((s.Name || '').includes(m)) mfr = m; });
        (byMfr[mfr] = byMfr[mfr] || []).push(s);
    });
    
    let slideHtml = '';
    Object.entries(byMfr).sort().forEach(([mfr, items]) => {
        slideHtml += `<div class="hardware-group">${mfr}</div>`;
        slideHtml += items.map(s => `<div class="hardware-item" data-oid="${s.OID}"><div class="name">${s.Name}</div></div>`).join('');
    });
    slideList.innerHTML = slideHtml || '<div style="padding:8px;color:#888;">No slides</div>';
}

function selectHinge(oid) {
    selectedHingeOID = String(oid);
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.oid === selectedHingeOID);
    });
    updatePreview();
}

function populateHingeTemplates() {
    const select = document.getElementById('hinge-template');
    if (!DB?.Hinging) return;
    select.innerHTML = DB.Hinging.map(h => {
        const hinge = getHingeInfo(h.HingeOID);
        return `<option value="${h.OID}" data-hinge-oid="${h.HingeOID}">${h.Template} - ${hinge?.Name || '?'}</option>`;
    }).join('');
    updateHingeTemplate();
}

function updateHingeTemplate() {
    const select = document.getElementById('hinge-template');
    const template = DB?.Hinging?.find(h => String(h.OID) === select.value);
    if (template) {
        document.getElementById('bottom-hinge').textContent = template.BottomHinge;
        document.getElementById('top-hinge').textContent = template.TopHinge;
        const opt = select.options[select.selectedIndex];
        if (opt?.dataset?.hingeOid) selectHinge(opt.dataset.hingeOid);
    }
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
    const search = document.getElementById(type + '-search').value.toLowerCase();
    document.querySelectorAll(`#${type}-list .hardware-item`).forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
}

// === PARTS MANAGEMENT ===
function renderParts() {
    const defaultSide = document.getElementById('hinge-side')?.value || 'left';
    document.getElementById('parts-tbody').innerHTML = parts.map(p => `
        <tr data-id="${p.id}">
            <td><input type="checkbox" ${p.selected !== false ? 'checked' : ''} onchange="togglePart(${p.id})"></td>
            <td><input value="${p.name}" onchange="updatePart(${p.id},'name',this.value)"></td>
            <td><input value="${formatDimension(p.width)}" onchange="updatePart(${p.id},'width',parseDimension(this.value))"></td>
            <td><input value="${formatDimension(p.height)}" onchange="updatePart(${p.id},'height',parseDimension(this.value))"></td>
            <td><select onchange="updatePart(${p.id},'type',this.value)">
                <option ${p.type==='door'?'selected':''}>door</option>
                <option ${p.type==='drawer'?'selected':''}>drawer</option>
            </select></td>
            <td><select onchange="updatePart(${p.id},'hingeSide',this.value)">
                <option value="left" ${p.hingeSide==='left'?'selected':''}>L</option>
                <option value="right" ${p.hingeSide==='right'?'selected':''}>R</option>
                <option value="both" ${p.hingeSide==='both'?'selected':''}>LR</option>
            </select></td>
            <td><button onclick="removePart(${p.id})" class="btn-delete">×</button></td>
        </tr>
    `).join('');
    updateStats();
    populatePreviewSelect();
    updatePreview();
}

function togglePart(id) {
    const p = parts.find(x => x.id === id);
    if (p) p.selected = !p.selected;
}

function updatePart(id, field, value) {
    const p = parts.find(x => x.id === id);
    if (p) { p[field] = value; updateStats(); updatePreview(); }
}

function addPart() {
    const id = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    const defaultSide = document.getElementById('hinge-side')?.value || 'left';
    parts.push({ id, name: 'Door ' + id, width: 15, height: 30, type: 'door', hingeSide: defaultSide, selected: true });
    renderParts();
}

function removePart(id) {
    parts = parts.filter(p => p.id !== id);
    renderParts();
}

function clearAllParts() {
    if (!parts.length || confirm('Clear all parts?')) { parts = []; renderParts(); }
}

function updateStats() {
    const doors = parts.filter(p => p.type === 'door').length;
    const drawers = parts.filter(p => p.type === 'drawer').length;
    const sqFt = parts.reduce((s, p) => s + p.width * p.height / 144, 0);
    const sheetSqFt = parseFloat(document.getElementById('sheet-size')?.value || 32);
    const sheets = Math.ceil(sqFt * 1.15 / sheetSqFt);
    
    document.getElementById('stat-parts').textContent = parts.length;
    document.getElementById('stat-doors').textContent = doors;
    document.getElementById('stat-drawers').textContent = drawers;
    document.getElementById('stat-sqft').textContent = sqFt.toFixed(1);
    document.getElementById('stat-sheets').textContent = sheets;
}

function populatePreviewSelect() {
    const select = document.getElementById('preview-select');
    select.innerHTML = parts.length ? parts.map(p => 
        `<option value="${p.id}">${p.name} (${formatDimension(p.width)} × ${formatDimension(p.height)})</option>`
    ).join('') : '<option>Add parts to preview</option>';
}

function updateUnits() {
    displayUnits = document.getElementById('display-units').value;
    renderParts();
}

// === CSV IMPORT/EXPORT ===
function showImportModal() { document.getElementById('import-modal').style.display = 'flex'; }
function hideImportModal() { document.getElementById('import-modal').style.display = 'none'; }

function loadCSVFile(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { document.getElementById('csv-input').value = ev.target.result; };
        reader.readAsText(file);
    }
}

function importCSV() {
    const text = document.getElementById('csv-input').value.trim();
    if (!text) return;
    
    const lines = text.split('\n').filter(l => l.trim());
    let nextId = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    const newParts = [];
    
    lines.forEach((line, i) => {
        if (i === 0 && line.toLowerCase().includes('name') && line.toLowerCase().includes('width')) return;
        const cols = line.split(/[,\t]/).map(c => c.trim());
        if (cols.length >= 3) {
            const width = parseDimension(cols[1]);
            const height = parseDimension(cols[2]);
            if (width > 0 && height > 0) {
                newParts.push({
                    id: nextId++,
                    name: cols[0] || `Part ${nextId}`,
                    width, height,
                    type: (cols[3] || 'door').toLowerCase().includes('drawer') ? 'drawer' : 'door',
                    hingeSide: (cols[4] || 'left').toLowerCase().trim() || 'left',
                    selected: true
                });
            }
        }
    });
    
    if (newParts.length) {
        parts = [...parts, ...newParts];
        renderParts();
        hideImportModal();
        document.getElementById('csv-input').value = '';
    } else {
        alert('No valid parts found. Format: Name, Width, Height, Type, HingeSide');
    }
}

// === JOB SAVE/LOAD ===
function getJobData() {
    return {
        jobNumber: document.getElementById('job-number').value,
        customer: document.getElementById('customer-name').value,
        date: document.getElementById('job-date').value,
        notes: document.getElementById('job-notes').value,
        hingeOID: selectedHingeOID,
        hingeTemplate: document.getElementById('hinge-template').value,
        hingeSide: document.getElementById('hinge-side').value,
        hingeCount: document.getElementById('hinge-count').value,
        displayUnits, parts
    };
}

function setJobData(data) {
    document.getElementById('job-number').value = data.jobNumber || '';
    document.getElementById('customer-name').value = data.customer || '';
    document.getElementById('job-date').value = data.date || '';
    document.getElementById('job-notes').value = data.notes || '';
    if (data.hingeOID) selectHinge(data.hingeOID);
    if (data.hingeTemplate) document.getElementById('hinge-template').value = data.hingeTemplate;
    if (data.hingeSide) document.getElementById('hinge-side').value = data.hingeSide;
    if (data.hingeCount) document.getElementById('hinge-count').value = data.hingeCount;
    if (data.displayUnits) { displayUnits = data.displayUnits; document.getElementById('display-units').value = displayUnits; }
    parts = data.parts || [];
    renderParts();
}

function saveJob() {
    const data = getJobData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.jobNumber || 'job'}_${data.customer || 'customer'}.json`.replace(/\s+/g, '_');
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
                try { setJobData(JSON.parse(ev.target.result)); }
                catch { alert('Invalid job file'); }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

function printCutList() {
    const job = getJobData();
    const hinge = getHingeInfo(selectedHingeOID);
    const sqFt = parts.reduce((s, p) => s + p.width * p.height / 144, 0);
    
    const html = `<!DOCTYPE html><html><head><title>Cut List - ${job.jobNumber}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        h1 { font-size: 16px; margin-bottom: 5px; }
        .info { color: #666; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
        th { background: #f5f5f5; }
        .summary { margin-top: 15px; font-weight: bold; }
    </style></head><body>
    <h1>Cut List: ${job.jobNumber}</h1>
    <div class="info">
        <b>Customer:</b> ${job.customer} | <b>Date:</b> ${job.date} | <b>Hinge:</b> ${hinge?.Name || 'N/A'}<br>
        ${job.notes ? `<b>Notes:</b> ${job.notes}` : ''}
    </div>
    <table>
        <tr><th>#</th><th>Name</th><th>Width</th><th>Height</th><th>Type</th><th>Hinge Side</th></tr>
        ${parts.map((p, i) => `<tr>
            <td>${i + 1}</td><td>${p.name}</td><td>${formatDimension(p.width)}</td>
            <td>${formatDimension(p.height)}</td><td>${p.type}</td><td>${p.hingeSide}</td>
        </tr>`).join('')}
    </table>
    <div class="summary">Total: ${parts.length} parts | ${parts.filter(p=>p.type==='door').length} doors | 
    ${parts.filter(p=>p.type==='drawer').length} drawers | ${sqFt.toFixed(2)} sq ft</div>
    </body></html>`;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// === PREVIEW CANVAS ===
function updatePreview() {
    if (!ctx || !canvas) return;
    
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    // Get container dimensions
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    
    if (W <= 0 || H <= 0) return;
    
    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    
    // Only resize if needed
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, W, H);
    
    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    
    const part = parts.find(p => p.id == document.getElementById('preview-select')?.value);
    if (!part) {
        ctx.fillStyle = '#64748b';
        ctx.font = '500 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Add parts to see preview', W / 2, H / 2);
        return;
    }
    
    // Calculate transform
    const pad = 100;
    const baseScale = Math.min((W - pad * 2) / part.width, (H - pad * 2) / part.height);
    const scale = baseScale * zoomLevel;
    const pw = part.width * scale;
    const ph = part.height * scale;
    const ox = (W - pw) / 2 + panOffset.x;
    const oy = (H - ph) / 2 + panOffset.y;
    
    previewTransform = { scale, offsetX: ox - panOffset.x, offsetY: oy - panOffset.y, partWidth: part.width, partHeight: part.height };
    
    // Subtle grid
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.lineWidth = 1;
    const gs = scale;
    if (gs > 10) {
        for (let x = ox % gs; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = oy % gs; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    
    // Part shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    
    // Part rectangle with wood-like gradient
    const partGrad = ctx.createLinearGradient(ox, oy, ox + pw, oy + ph);
    partGrad.addColorStop(0, '#d4a574');
    partGrad.addColorStop(0.3, '#c4956a');
    partGrad.addColorStop(0.7, '#b8895e');
    partGrad.addColorStop(1, '#a67c52');
    ctx.fillStyle = partGrad;
    ctx.fillRect(ox, oy, pw, ph);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Wood grain lines
    ctx.strokeStyle = 'rgba(139, 90, 43, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < ph; i += 8) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + i);
        ctx.lineTo(ox + pw, oy + i + (Math.random() - 0.5) * 4);
        ctx.stroke();
    }
    
    // Part outline
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox, oy, pw, ph);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 1, oy + 1, pw - 2, ph - 2);
    
    // Get holes
    const hingeSide = part.hingeSide || document.getElementById('hinge-side')?.value || 'left';
    const baseHingeCount = parseInt(document.getElementById('hinge-count')?.value || '2');
    // Auto-add middle hinge for tall doors (over 40")
    let hingeCount = baseHingeCount;
    if (part.height > 40 && baseHingeCount === 2) {
        hingeCount = 3;
    }
    if (part.height > 60 && hingeCount < 4) {
        hingeCount = 4;
    }
    
    const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount) : getDrawerHoles(part);
    
    // Draw dimension callouts and dashed lines FIRST (behind holes)
    if (showDimensions && part.type === 'door' && holes.length > 0) {
        drawHingeSpecs(ctx, ox, oy, scale, part, holes, hingeSide);
    }
    
    // Draw holes with modern styling
    holes.forEach(h => {
        const hx = ox + h.x * scale;
        const hy = oy + (part.height - h.y) * scale;
        const r = Math.max(h.dia / 2 * scale, 4);
        
        // Hole shadow/depth effect
        const holeGrad = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.3, 0, hx, hy, r);
        if (h.isCup) {
            holeGrad.addColorStop(0, '#1f2937');
            holeGrad.addColorStop(0.7, '#111827');
            holeGrad.addColorStop(1, '#030712');
        } else {
            holeGrad.addColorStop(0, '#374151');
            holeGrad.addColorStop(1, '#111827');
        }
        
        // Outer ring (hole edge)
        ctx.beginPath();
        ctx.arc(hx, hy, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = h.isCup ? '#dc2626' : '#22c55e';
        ctx.fill();
        
        // Inner hole
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = holeGrad;
        ctx.fill();
        
        // Highlight
        ctx.beginPath();
        ctx.arc(hx - r * 0.25, hy - r * 0.25, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        
        // Diameter label for cups
        if (h.isCup && r > 15) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(h.dia * 25.4) + 'mm', hx, hy);
        }
    });
    
    // Part dimensions
    if (showDimensions) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Width dimension with arrows
        drawDimensionLine(ctx, ox, oy - 30, ox + pw, oy - 30, formatDimension(part.width));
        
        // Height dimension
        ctx.save();
        ctx.translate(ox - 35, oy + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatDimension(part.height), 0, 0);
        ctx.restore();
        
        // Hinge side indicator
        ctx.font = '600 12px system-ui, sans-serif';
        if (hingeSide === 'left' || hingeSide === 'both') {
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'left';
            ctx.fillText('◀ HINGE SIDE', ox + 8, oy + ph - 15);
        }
        if (hingeSide === 'right' || hingeSide === 'both') {
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'right';
            ctx.fillText('HINGE SIDE ▶', ox + pw - 8, oy + ph - 15);
        }
        
        // Auto hinge count indicator
        if (hingeCount !== baseHingeCount) {
            ctx.fillStyle = '#f97316';
            ctx.font = '500 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Auto: ${hingeCount} hinges (door > ${hingeCount === 4 ? '60' : '40'}")`, ox + pw / 2, oy + ph + 20);
        }
    }
    
    // Measure line
    if (measureStart) {
        const sx = ox + measureStart.x * scale;
        const sy = oy + (part.height - measureStart.y) * scale;
        
        // Start point
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('1', sx, sy + 3);
        
        if (measureStart.endX !== undefined) {
            const ex = ox + measureStart.endX * scale;
            const ey = oy + (part.height - measureStart.endY) * scale;
            
            // Line
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // End point
            ctx.beginPath();
            ctx.arc(ex, ey, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#06b6d4';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.fillText('2', ex, ey + 3);
            
            // Distance label
            const mx = (sx + ex) / 2, my = (sy + ey) / 2;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.95)';
            roundRect(ctx, mx - 45, my - 12, 90, 24, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText((measureStart.distance * 25.4).toFixed(2) + ' mm', mx, my + 4);
        }
    }
    
    // Modern legend bar
    const lgH = 36;
    const lgGrad = ctx.createLinearGradient(0, H - lgH, 0, H);
    lgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
    lgGrad.addColorStop(1, 'rgba(30, 41, 59, 0.98)');
    ctx.fillStyle = lgGrad;
    ctx.fillRect(0, H - lgH, W, lgH);
    
    // Top border
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - lgH);
    ctx.lineTo(W, H - lgH);
    ctx.stroke();
    
    const hinge = getHingeInfo(selectedHingeOID);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(hinge?.Name || 'Select a hinge', 12, H - lgH / 2);
    
    // Legend items
    let lx = 200;
    ctx.beginPath(); ctx.arc(lx, H - lgH / 2, 6, 0, Math.PI * 2); ctx.fillStyle = '#dc2626'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '500 11px system-ui';
    ctx.fillText('35mm Cup', lx + 12, H - lgH / 2);
    
    ctx.beginPath(); ctx.arc(lx + 90, H - lgH / 2, 5, 0, Math.PI * 2); ctx.fillStyle = '#22c55e'; ctx.fill();
    ctx.fillText('8mm Pilot', lx + 100, H - lgH / 2);
    
    // Zoom indicator
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`Zoom: ${Math.round(zoomLevel * 100)}%`, W - 12, H - lgH / 2);
}

// Draw dimension line with arrows
function drawDimensionLine(ctx, x1, y1, x2, y2, label) {
    const arrowSize = 6;
    
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Arrows
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + arrowSize, y1 - arrowSize / 2);
    ctx.lineTo(x1 + arrowSize, y1 + arrowSize / 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - arrowSize, y2 - arrowSize / 2);
    ctx.lineTo(x2 - arrowSize, y2 + arrowSize / 2);
    ctx.fill();
    
    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, (x1 + x2) / 2, y1 - 8);
}

// Draw hinge manufacturer specs
function drawHingeSpecs(ctx, ox, oy, scale, part, holes, hingeSide) {
    const sides = hingeSide === 'both' ? ['left', 'right'] : [hingeSide];
    
    sides.forEach(side => {
        // Find cup and pilot holes for this side
        const sideHoles = holes.filter(h => {
            const isLeftSide = h.x < part.width / 2;
            return (side === 'left' && isLeftSide) || (side === 'right' && !isLeftSide);
        });
        
        // Get first hinge set (bottom)
        const cups = sideHoles.filter(h => h.isCup).sort((a, b) => a.y - b.y);
        const pilots = sideHoles.filter(h => !h.isCup).sort((a, b) => a.y - b.y);
        
        if (cups.length === 0) return;
        
        const cup = cups[0];
        const cupX = ox + cup.x * scale;
        const cupY = oy + (part.height - cup.y) * scale;
        const edgeX = side === 'left' ? ox : ox + part.width * scale;
        
        // Cup setback from edge - solid cyan line
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(edgeX, cupY);
        ctx.lineTo(cupX, cupY);
        ctx.stroke();
        
        // Setback dimension
        const setback = cup.x * 25.4;
        const setbackLabel = setback.toFixed(1) + 'mm';
        ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
        const lblX = (edgeX + cupX) / 2;
        roundRect(ctx, lblX - 25, cupY - 22, 50, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(setbackLabel, lblX, cupY - 10);
        
        // Dashed lines from cup to pilots
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        
        // Find pilots associated with this cup (same hinge)
        const cupPilots = pilots.filter(p => Math.abs(p.y - cup.y) < 3 || 
            (Math.abs(p.y - (cup.y + 22.5/25.4)) < 1) || 
            (Math.abs(p.y - (cup.y - 22.5/25.4)) < 1));
        
        cupPilots.forEach(pilot => {
            const pilotX = ox + pilot.x * scale;
            const pilotY = oy + (part.height - pilot.y) * scale;
            
            ctx.beginPath();
            ctx.moveTo(cupX, cupY);
            ctx.lineTo(pilotX, pilotY);
            ctx.stroke();
        });
        
        ctx.setLineDash([]);
        
        // Pilot offset specs (show once per side)
        if (cupPilots.length > 0) {
            const pilot = cupPilots[0];
            const xOffset = Math.abs(pilot.x - cup.x) * 25.4;
            const yOffset = Math.abs(pilot.y - cup.y) * 25.4;
            
            // Spec box
            const specX = side === 'left' ? ox + 10 : ox + part.width * scale - 110;
            const specY = oy + 10;
            
            ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
            roundRect(ctx, specX, specY, 100, 42, 4);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.font = '600 9px system-ui';
            ctx.textAlign = 'left';
            ctx.fillText('PILOT FROM CUP:', specX + 6, specY + 12);
            ctx.font = 'bold 10px system-ui';
            ctx.fillText(`X: ${xOffset.toFixed(1)}mm`, specX + 6, specY + 26);
            ctx.fillText(`Y: ±${yOffset.toFixed(1)}mm`, specX + 6, specY + 38);
        }
    });
}

// Rounded rectangle helper
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function getHingeHoles(part, hingeSide, hingeCount) {
    const holes = [];
    const template = DB?.Hinging?.find(h => String(h.OID) === document.getElementById('hinge-template')?.value);
    const oid = selectedHingeOID || template?.HingeOID || '73';
    const pattern = getHingeHolePattern(oid);
    
    if (!pattern?.length) return getHingeHolesFallback(part, hingeSide, hingeCount);
    
    // Calculate Y positions based on hinge count
    const bottomY = 3;
    const topY = part.height - 3;
    let yPositions = [bottomY, topY];
    
    if (hingeCount >= 3) {
        yPositions.push(part.height / 2);
    }
    if (hingeCount >= 4) {
        yPositions.push(part.height * 0.33);
        yPositions.push(part.height * 0.67);
        yPositions = [bottomY, part.height * 0.33, part.height * 0.67, topY];
    }
    
    const sides = hingeSide === 'both' ? ['left', 'right'] : [hingeSide];
    
    sides.forEach(side => {
        yPositions.forEach(hingeY => {
            pattern.forEach(h => {
                const isCup = h.dia > 1;
                const x = side === 'right' ? part.width - h.x : h.x;
                holes.push({
                    x, y: hingeY + h.z,
                    dia: h.dia, depth: h.depth,
                    color: isCup ? '#dc2626' : '#22c55e',
                    isCup
                });
            });
        });
    });
    
    return holes;
}

function getHingeHolesFallback(part, hingeSide, hingeCount) {
    const cupX = 22.5 / 25.4, pilotX = 32 / 25.4, zOff = 22.5 / 25.4;
    const cupD = 35 / 25.4, pilotD = 8 / 25.4;
    const holes = [];
    
    let yPositions = [3, part.height - 3];
    if (hingeCount >= 3) yPositions.push(part.height / 2);
    if (hingeCount >= 4) yPositions = [3, part.height * 0.33, part.height * 0.67, part.height - 3];
    
    const sides = hingeSide === 'both' ? ['left', 'right'] : [hingeSide];
    
    sides.forEach(side => {
        yPositions.forEach(y => {
            const cx = side === 'right' ? part.width - cupX : cupX;
            const px = side === 'right' ? part.width - pilotX : pilotX;
            holes.push({ x: cx, y, dia: cupD, color: '#dc2626', isCup: true });
            holes.push({ x: px, y: y - zOff, dia: pilotD, color: '#22c55e', isCup: false });
            holes.push({ x: px, y: y + zOff, dia: pilotD, color: '#22c55e', isCup: false });
        });
    });
    
    return holes;
}

function getDrawerHoles(part) {
    const d = 5 / 25.4, m = 1.5;
    return [
        { x: m, y: m, dia: d, color: '#f59e0b', isCup: false },
        { x: part.width - m, y: m, dia: d, color: '#f59e0b', isCup: false },
        { x: m, y: part.height - m, dia: d, color: '#f59e0b', isCup: false },
        { x: part.width - m, y: part.height - m, dia: d, color: '#f59e0b', isCup: false }
    ];
}

// === CONTROLS ===
function toggleDimensions() {
    showDimensions = !showDimensions;
    document.getElementById('btn-dimensions').classList.toggle('active', showDimensions);
    updatePreview();
}

function toggleMeasure() {
    measureMode = !measureMode;
    measureStart = null;
    document.getElementById('btn-measure').classList.toggle('active', measureMode);
    document.getElementById('btn-measure').textContent = measureMode ? '📏 Start Pt' : '📏 Measure';
    document.getElementById('measure-result').textContent = measureMode ? 'Click first point on part...' : 'Drag to pan • Scroll to zoom';
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
    updatePreview();
}

function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 5); updatePreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.25); updatePreview(); }
function resetZoom() { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updatePreview(); }

// === FORMATTING ===
function formatDimension(inches) {
    if (!inches || isNaN(inches)) return '0';
    switch (displayUnits) {
        case 'metric': return (inches * 25.4).toFixed(1) + 'mm';
        case 'decimal': return inches.toFixed(3).replace(/\.?0+$/, '') + '"';
        default: return formatFraction(inches);
    }
}

function formatFraction(d) {
    if (d < 0) return '-' + formatFraction(-d);
    const w = Math.floor(d);
    const f = d - w;
    const fracs = [[1/16,'1/16'],[1/8,'1/8'],[3/16,'3/16'],[1/4,'1/4'],[5/16,'5/16'],[3/8,'3/8'],[7/16,'7/16'],[1/2,'1/2'],[9/16,'9/16'],[5/8,'5/8'],[11/16,'11/16'],[3/4,'3/4'],[13/16,'13/16'],[7/8,'7/8'],[15/16,'15/16']];
    if (f < 0.03) return w + '"';
    let best = fracs[0];
    for (const [v, s] of fracs) if (Math.abs(f - v) < Math.abs(f - best[0])) best = [v, s];
    return w ? `${w}-${best[1]}"` : `${best[1]}"`;
}

function parseDimension(s) {
    if (!s) return 0;
    s = String(s).trim();
    if (s.toLowerCase().includes('mm')) return parseFloat(s) / 25.4;
    s = s.replace(/"/g, '');
    if (s.includes('-') && s.includes('/')) {
        const [whole, frac] = s.split('-');
        const [n, d] = frac.split('/');
        return parseInt(whole) + parseFloat(n) / parseFloat(d);
    }
    if (s.includes('/')) {
        const [n, d] = s.split('/');
        return parseFloat(n) / parseFloat(d);
    }
    return parseFloat(s) || 0;
}

// === DXF EXPORT ===
function exportSelectedDXF() {
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (part) generateDXF([part]);
}

function exportAllDXF() {
    const selected = parts.filter(p => p.selected !== false);
    if (!selected.length) { alert('No parts selected'); return; }
    generateDXF(selected);
}

function generateDXF(list) {
    const jobNum = document.getElementById('job-number').value || 'job';
    const hingeCount = parseInt(document.getElementById('hinge-count')?.value || '2');
    
    list.forEach(part => {
        const hingeSide = part.hingeSide || document.getElementById('hinge-side')?.value || 'left';
        
        let dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
        ['Outline', 'Hinge_Cup_35mm', 'Hinge_Pilot_8mm', 'Drawer_5mm'].forEach(n =>
            dxf += `0\nLAYER\n2\n${n}\n70\n0\n62\n7\n6\nCONTINUOUS\n`
        );
        dxf += '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
        
        // Outline
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n`;
        dxf += `10\n0\n20\n0\n10\n${part.width}\n20\n0\n10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        // Holes
        const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount) : getDrawerHoles(part);
        holes.forEach(h => {
            const layer = h.dia > 1 ? 'Hinge_Cup_35mm' : part.type === 'door' ? 'Hinge_Pilot_8mm' : 'Drawer_5mm';
            dxf += `0\nCIRCLE\n8\n${layer}\n10\n${h.x.toFixed(4)}\n20\n${h.y.toFixed(4)}\n40\n${(h.dia / 2).toFixed(4)}\n`;
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        const side = hingeSide === 'both' ? 'LR' : hingeSide.charAt(0).toUpperCase();
        const fn = `${jobNum}_${part.name}_${formatDimension(part.width)}x${formatDimension(part.height)}_${side}.dxf`
            .replace(/["\s]+/g, '_').replace(/mm/g, '');
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
        a.download = fn;
        a.click();
    });
}
