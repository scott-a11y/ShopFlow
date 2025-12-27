// ShopFlow - Door Production Tool
// CSV import, job management, material calculation

let DB = null;
let parts = [];
let zoomLevel = 1;
let showDimensions = true;
let measureMode = false;
let measureStart = null;
let selectedHingeOID = null;
let canvas, ctx;
let displayUnits = 'fraction'; // 'fraction', 'decimal', 'metric'

let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let previewTransform = {};

document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('preview');
    ctx = canvas.getContext('2d');
    
    // Set today's date
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
    
    // Start with empty parts list
    parts = [];
    renderParts();
});

function resizeCanvas() {
    const container = document.getElementById('preview-container');
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
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
    zoomLevel *= e.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel = Math.max(0.25, Math.min(5, zoomLevel));
    updatePreview();
}

function handleMeasureClick(x, y) {
    const t = previewTransform;
    if (!t.scale) return;
    
    const partX = (x - t.offsetX - panOffset.x) / t.scale;
    const partY = t.partHeight - (y - t.offsetY - panOffset.y) / t.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY, screenX: x, screenY: y };
        document.getElementById('btn-measure').textContent = 'Click End';
        document.getElementById('measure-result').innerHTML = '<b>Start set.</b> Click second point.';
        updatePreview();
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        measureStart.endX = partX;
        measureStart.endY = partY;
        measureStart.distance = dist;
        
        document.getElementById('measure-result').innerHTML = 
            `<b>Distance:</b> ${formatDimension(dist)} (${(dist * 25.4).toFixed(2)}mm) | ` +
            `<b>ΔX:</b> ${formatDimension(Math.abs(dx))} | <b>ΔY:</b> ${formatDimension(Math.abs(dy))}`;
        
        updatePreview();
        
        setTimeout(() => {
            measureStart = null;
            measureMode = false;
            document.getElementById('btn-measure').textContent = 'Measure';
            document.getElementById('btn-measure').classList.remove('active');
            canvas.style.cursor = 'grab';
            updatePreview();
        }, 3000);
    }
}

// === DATABASE ===
async function loadDatabase() {
    try {
        const response = await fetch('data/CabinetSenseDB_combined.json');
        const data = await response.json();
        DB = data.tables;
        
        document.getElementById('db-info').textContent = 
            `DB: ${DB.Hole?.length || 0} holes | ${DB.Part?.length || 0} parts`;
        
        populateHardwareLists();
        populateHingeTemplates();
    } catch (error) {
        console.error('Database error:', error);
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
    if (!DB?.Part) return null;
    return DB.Part.find(p => String(p.OID) === String(oid));
}

// === HARDWARE LISTS ===
function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    const partsWithHoles = new Set(DB?.Hole?.map(h => String(h.OIDPart)) || []);
    
    const hingeClasses = ['28', '15'];
    const hinges = DB?.Part?.filter(p => 
        hingeClasses.includes(String(p.Class)) && 
        partsWithHoles.has(String(p.OID))
    ) || [];
    
    let html = '';
    
    const doorHinges = hinges.filter(h => String(h.Class) === '28');
    if (doorHinges.length) {
        html += '<div class="hardware-group">Door Hinges</div>';
        html += doorHinges.map(h => {
            const pattern = getHingeHolePattern(h.OID);
            return `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge('${h.OID}')">
                <div class="name">${h.Name || 'Unnamed'}</div>
                <div class="details">${pattern?.length || 0} holes</div>
            </div>`;
        }).join('');
    }
    
    const hingeClips = hinges.filter(h => String(h.Class) === '15');
    if (hingeClips.length) {
        html += '<div class="hardware-group">Hinge Clips</div>';
        html += hingeClips.map(h => {
            const pattern = getHingeHolePattern(h.OID);
            return `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge('${h.OID}')">
                <div class="name">${h.Name || 'Unnamed'}</div>
                <div class="details">${pattern?.length || 0} holes</div>
            </div>`;
        }).join('');
    }
    
    hingeList.innerHTML = html || '<div style="padding:10px;color:#666;">No hinges</div>';
    if (doorHinges.length > 0) selectHinge(doorHinges[0].OID);
    
    // Slides
    const slideList = document.getElementById('slide-list');
    const slideSystems = DB?.Part?.filter(p => 
        String(p.Class) === '25' && partsWithHoles.has(String(p.OID))
    ) || [];
    
    const byMfr = {};
    slideSystems.forEach(s => {
        const name = s.Name || '';
        let mfr = 'Other';
        ['Blum', 'Hettich', 'Grass', 'Salice', 'KV', 'Hafele'].forEach(m => {
            if (name.includes(m)) mfr = m;
        });
        if (!byMfr[mfr]) byMfr[mfr] = [];
        byMfr[mfr].push(s);
    });
    
    let slideHtml = '';
    for (const [mfr, systems] of Object.entries(byMfr).sort()) {
        slideHtml += `<div class="hardware-group">${mfr}</div>`;
        slideHtml += systems.map(s => 
            `<div class="hardware-item" data-oid="${s.OID}" onclick="selectSlide('${s.OID}')">
                <div class="name">${s.Name}</div>
            </div>`
        ).join('');
    }
    slideList.innerHTML = slideHtml || '<div style="padding:10px;color:#666;">No slides</div>';
}

function selectHinge(oid) {
    selectedHingeOID = String(oid);
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', String(el.dataset.oid) === selectedHingeOID);
    });
    updatePreview();
}

function selectSlide(oid) {
    document.querySelectorAll('#slide-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', String(el.dataset.oid) === String(oid));
    });
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

function updateUnits() {
    displayUnits = document.getElementById('display-units').value;
    renderParts();
    updatePreview();
}

function filterHardware(type) {
    const search = document.getElementById(type + '-search').value.toLowerCase();
    document.querySelectorAll(`#${type}-list .hardware-item`).forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
}

// === PARTS MANAGEMENT ===
function renderParts() {
    document.getElementById('parts-tbody').innerHTML = parts.map((p, i) => `
        <tr data-id="${p.id}">
            <td><input type="checkbox" ${p.selected !== false ? 'checked' : ''} onchange="togglePart(${p.id})"></td>
            <td><input value="${p.name}" onchange="updatePart(${p.id},'name',this.value)"></td>
            <td><input value="${formatDimension(p.width)}" onchange="updatePart(${p.id},'width',parseDimension(this.value))"></td>
            <td><input value="${formatDimension(p.height)}" onchange="updatePart(${p.id},'height',parseDimension(this.value))"></td>
            <td><select onchange="updatePart(${p.id},'type',this.value)">
                <option ${p.type==='door'?'selected':''}>door</option>
                <option ${p.type==='drawer'?'selected':''}>drawer</option>
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
    if (p) { 
        p[field] = value; 
        updateStats();
        updatePreview(); 
    }
}

function addPart() {
    const id = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    parts.push({ id, name: 'Part ' + id, width: 18, height: 24, type: 'door', selected: true });
    renderParts();
}

function removePart(id) {
    parts = parts.filter(p => p.id !== id);
    renderParts();
}

function clearAllParts() {
    if (parts.length === 0 || confirm('Clear all parts?')) {
        parts = [];
        renderParts();
    }
}

function updateStats() {
    const doors = parts.filter(p => p.type === 'door');
    const drawers = parts.filter(p => p.type === 'drawer');
    
    // Calculate square footage
    const totalSqIn = parts.reduce((sum, p) => sum + (p.width * p.height), 0);
    const totalSqFt = totalSqIn / 144;
    
    // Calculate sheets needed
    const sheetSize = parseFloat(document.getElementById('sheet-size')?.value || 32);
    const wasteFactor = parseFloat(document.getElementById('waste-factor')?.value || 1.15);
    const sheetsNeeded = Math.ceil((totalSqFt * wasteFactor) / sheetSize);
    
    document.getElementById('stat-parts').textContent = parts.length;
    document.getElementById('stat-doors').textContent = doors.length;
    document.getElementById('stat-drawers').textContent = drawers.length;
    document.getElementById('stat-sqft').textContent = totalSqFt.toFixed(1);
    document.getElementById('stat-sheets').textContent = sheetsNeeded || 0;
}

function populatePreviewSelect() {
    const select = document.getElementById('preview-select');
    select.innerHTML = parts.length ? parts.map(p => 
        `<option value="${p.id}">${p.name} (${formatDimension(p.width)} × ${formatDimension(p.height)})</option>`
    ).join('') : '<option>No parts</option>';
}

// === CSV IMPORT ===
function showImportModal() {
    document.getElementById('import-modal').style.display = 'flex';
}

function hideImportModal() {
    document.getElementById('import-modal').style.display = 'none';
}

function loadCSVFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('csv-input').value = e.target.result;
    };
    reader.readAsText(file);
}

function importCSV() {
    const text = document.getElementById('csv-input').value.trim();
    if (!text) return;
    
    const lines = text.split('\n').filter(l => l.trim());
    const newParts = [];
    let nextId = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    
    lines.forEach((line, i) => {
        // Skip header row if detected
        if (i === 0 && line.toLowerCase().includes('name') && line.toLowerCase().includes('width')) return;
        
        const cols = line.split(/[,\t]/).map(c => c.trim());
        if (cols.length >= 3) {
            const name = cols[0] || `Part ${nextId}`;
            const width = parseFraction(cols[1]);
            const height = parseFraction(cols[2]);
            const type = (cols[3] || 'door').toLowerCase().includes('drawer') ? 'drawer' : 'door';
            
            if (width > 0 && height > 0) {
                newParts.push({ id: nextId++, name, width, height, type, selected: true });
            }
        }
    });
    
    if (newParts.length > 0) {
        parts = [...parts, ...newParts];
        renderParts();
        hideImportModal();
        document.getElementById('csv-input').value = '';
    } else {
        alert('No valid parts found. Check format:\nName, Width, Height, Type');
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
        materialThickness: document.getElementById('material-thickness').value,
        displayUnits: displayUnits,
        parts: parts
    };
}

function setJobData(data) {
    document.getElementById('job-number').value = data.jobNumber || '';
    document.getElementById('customer-name').value = data.customer || '';
    document.getElementById('job-date').value = data.date || '';
    document.getElementById('job-notes').value = data.notes || '';
    
    if (data.hingeOID) selectHinge(data.hingeOID);
    if (data.hingeTemplate) document.getElementById('hinge-template').value = data.hingeTemplate;
    if (data.materialThickness) document.getElementById('material-thickness').value = data.materialThickness;
    if (data.displayUnits) {
        displayUnits = data.displayUnits;
        document.getElementById('display-units').value = displayUnits;
    }
    
    parts = data.parts || [];
    renderParts();
}

function saveJob() {
    const data = getJobData();
    const json = JSON.stringify(data, null, 2);
    const filename = `${data.jobNumber || 'job'}_${data.customer || 'customer'}.json`.replace(/\s+/g, '_');
    
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function loadJob() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                setJobData(data);
            } catch (err) {
                alert('Invalid job file');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function printCutList() {
    const jobNum = document.getElementById('job-number').value || 'N/A';
    const customer = document.getElementById('customer-name').value || 'N/A';
    const date = document.getElementById('job-date').value || 'N/A';
    const notes = document.getElementById('job-notes').value || '';
    const hinge = getHingeInfo(selectedHingeOID);
    
    const totalSqFt = parts.reduce((sum, p) => sum + (p.width * p.height / 144), 0);
    
    let html = `
        <html><head><title>Cut List - ${jobNum}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            .info { font-size: 12px; color: #666; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f5f5f5; }
            .summary { margin-top: 15px; font-size: 12px; }
        </style></head><body>
        <h1>Cut List: ${jobNum}</h1>
        <div class="info">
            <strong>Customer:</strong> ${customer} | 
            <strong>Date:</strong> ${date} | 
            <strong>Hinge:</strong> ${hinge?.Name || 'N/A'}<br>
            ${notes ? `<strong>Notes:</strong> ${notes}` : ''}
        </div>
        <table>
            <tr><th>#</th><th>Name</th><th>Width</th><th>Height</th><th>Type</th><th>Sq In</th></tr>
            ${parts.map((p, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${p.name}</td>
                    <td>${formatDimension(p.width)}</td>
                    <td>${formatDimension(p.height)}</td>
                    <td>${p.type}</td>
                    <td>${(p.width * p.height).toFixed(1)}</td>
                </tr>
            `).join('')}
        </table>
        <div class="summary">
            <strong>Total Parts:</strong> ${parts.length} | 
            <strong>Doors:</strong> ${parts.filter(p => p.type === 'door').length} | 
            <strong>Drawers:</strong> ${parts.filter(p => p.type === 'drawer').length} | 
            <strong>Total Sq Ft:</strong> ${totalSqFt.toFixed(2)}
        </div>
        </body></html>
    `;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// === PREVIEW ===
function updatePreview() {
    if (!ctx) return;
    
    const part = parts.find(p => p.id == document.getElementById('preview-select')?.value);
    
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!part) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Add parts to preview', canvas.width/2, canvas.height/2);
        return;
    }
    
    const pad = 70;
    const baseScale = Math.min((canvas.width - pad*2) / part.width, (canvas.height - pad*2) / part.height);
    const scale = baseScale * zoomLevel;
    const W = part.width * scale;
    const H = part.height * scale;
    const ox = (canvas.width - W) / 2 + panOffset.x;
    const oy = (canvas.height - H) / 2 + panOffset.y;
    
    previewTransform = { scale, offsetX: ox - panOffset.x, offsetY: oy - panOffset.y, partWidth: part.width, partHeight: part.height };
    
    // Grid
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    const gs = scale;
    for (let x = ox % gs; x < canvas.width; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = oy % gs; y < canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    
    // Part
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(ox, oy, W, H);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, W, H);
    
    // Holes
    const holes = part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part);
    
    holes.forEach(h => {
        const hx = ox + h.x * scale;
        const hy = oy + (part.height - h.y) * scale;
        const r = Math.max(h.dia / 2 * scale, 4);
        
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = h.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (r > 10) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(h.dia * 25.4) + '', hx, hy);
        }
    });
    
    // Dimensions
    if (showDimensions) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.setLineDash([]);
        ctx.fillText(formatDimension(part.width), ox + W/2, oy - 15);
        
        ctx.save();
        ctx.translate(ox - 15, oy + H/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillText(formatDimension(part.height), 0, 0);
        ctx.restore();
        
        // Hole callouts
        if (part.type === 'door' && holes.length) {
            const cup = holes.find(h => h.isCup);
            if (cup) {
                ctx.fillStyle = '#22d3ee';
                ctx.font = '10px sans-serif';
                ctx.fillText(`Cup: ${(cup.x * 25.4).toFixed(1)}mm from edge`, ox + W/2, oy + H + 20);
            }
        }
    }
    
    // Measure visualization
    if (measureStart) {
        const sx = ox + measureStart.x * scale;
        const sy = oy + (part.height - measureStart.y) * scale;
        
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (measureStart.endX !== undefined) {
            const ex = ox + measureStart.endX * scale;
            const ey = oy + (part.height - measureStart.endY) * scale;
            
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(ex, ey, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#22d3ee';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            
            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText((measureStart.distance * 25.4).toFixed(2) + 'mm', (sx + ex) / 2, (sy + ey) / 2 - 10);
        }
    }
    
    // Legend
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.fillRect(0, canvas.height - 35, canvas.width, 35);
    
    const info = selectedHingeOID ? getHingeInfo(selectedHingeOID) : null;
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(info?.Name || 'Select hinge', 10, canvas.height - 18);
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${Math.round(zoomLevel * 100)}%`, canvas.width - 10, canvas.height - 18);
}

function getHingeHoles(part) {
    const holes = [];
    const template = DB?.Hinging?.find(h => String(h.OID) === document.getElementById('hinge-template')?.value);
    const oid = selectedHingeOID || (template?.HingeOID ? String(template.HingeOID) : '73');
    const pattern = getHingeHolePattern(oid);
    
    if (!pattern?.length) return getHingeHolesFallback(part);
    
    let bottomY = 3, topY = part.height - 3;
    if (template) {
        const bv = template.BottomHinge.replace(/\[.*?\]/g, '').replace('-','').trim();
        bottomY = parseMM(bv) || 3;
        const tv = template.TopHinge.replace('[top]', '').replace('-','').trim();
        topY = part.height - (parseMM(tv) || 3);
    }
    
    const cupHole = pattern.find(h => h.dia > 1);
    const cupX = cupHole ? cupHole.x : pattern[0].x;
    
    [bottomY, topY].forEach(hingeY => {
        pattern.forEach(h => {
            const isCup = h.dia > 1;
            holes.push({
                x: h.x,
                y: hingeY + h.z,
                dia: h.dia,
                depth: h.depth,
                color: isCup ? '#dc2626' : '#16a34a',
                isCup: isCup
            });
        });
    });
    
    return holes;
}

function getHingeHolesFallback(part) {
    const cupX = 22.5/25.4, pilotX = 32/25.4, zOff = 22.5/25.4;
    const cupD = 35/25.4, pilotD = 8/25.4;
    const holes = [];
    
    [3, part.height - 3].forEach(y => {
        holes.push({ x: cupX, y, dia: cupD, color: '#dc2626', isCup: true });
        holes.push({ x: pilotX, y: y - zOff, dia: pilotD, color: '#16a34a', isCup: false });
        holes.push({ x: pilotX, y: y + zOff, dia: pilotD, color: '#16a34a', isCup: false });
    });
    return holes;
}

function getDrawerHoles(part) {
    const d = 5/25.4, i = 1.5;
    return [
        { x: i, y: i, dia: d, color: '#d97706', isCup: false },
        { x: part.width - i, y: i, dia: d, color: '#d97706', isCup: false },
        { x: i, y: part.height - i, dia: d, color: '#d97706', isCup: false },
        { x: part.width - i, y: part.height - i, dia: d, color: '#d97706', isCup: false }
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
    document.getElementById('btn-measure').textContent = measureMode ? 'Click Start' : 'Measure';
    document.getElementById('measure-result').textContent = measureMode ? 'Click first point...' : 'Drag to pan • Scroll to zoom';
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
    updatePreview();
}

function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 5); updatePreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.25); updatePreview(); }
function resetZoom() { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updatePreview(); }

// === FORMATTING ===
function formatDimension(inches) {
    if (inches === undefined || inches === null || isNaN(inches)) return '0';
    
    switch (displayUnits) {
        case 'metric':
            return (inches * 25.4).toFixed(1) + 'mm';
        case 'decimal':
            return inches.toFixed(3).replace(/\.?0+$/, '') + '"';
        case 'fraction':
        default:
            return formatFraction(inches);
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

function parseFraction(s) {
    if (!s) return 0;
    s = String(s).replace(/"/g, '').trim();
    if (s.includes('-')) { 
        const parts = s.split('-'); 
        return parseInt(parts[0]) + parseFraction(parts[1]); 
    }
    if (s.includes('/')) { 
        const [n, d] = s.split('/'); 
        return parseFloat(n) / parseFloat(d); 
    }
    return parseFloat(s) || 0;
}

function parseDimension(s) {
    if (!s) return 0;
    s = String(s).trim();
    
    // Metric (mm)
    if (s.toLowerCase().includes('mm')) {
        return parseFloat(s) / 25.4;
    }
    
    // Remove inch symbol
    s = s.replace(/"/g, '').trim();
    
    // Fraction (15-1/2)
    if (s.includes('-') && s.includes('/')) {
        const parts = s.split('-');
        return parseInt(parts[0]) + parseFraction(parts[1]);
    }
    
    // Just fraction (1/2)
    if (s.includes('/')) {
        const [n, d] = s.split('/');
        return parseFloat(n) / parseFloat(d);
    }
    
    // Decimal
    return parseFloat(s) || 0;
}

// === DXF EXPORT ===
function exportSelectedDXF() {
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (part) generateDXF([part]);
}

function exportAllDXF() {
    const selected = parts.filter(p => p.selected !== false);
    if (selected.length === 0) {
        alert('No parts selected');
        return;
    }
    generateDXF(selected);
}

function generateDXF(list) {
    const jobNum = document.getElementById('job-number').value || 'job';
    
    list.forEach(part => {
        let dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
        ['Outline','Hinge_Cup_35mm','Hinge_Pilot_8mm','Drawer_5mm'].forEach(n => 
            dxf += `0\nLAYER\n2\n${n}\n70\n0\n62\n7\n6\nCONTINUOUS\n`
        );
        dxf += '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
        
        // Outline
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n`;
        dxf += `10\n0\n20\n0\n10\n${part.width}\n20\n0\n10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        // Holes
        (part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part)).forEach(h => {
            const layer = h.dia > 1 ? 'Hinge_Cup_35mm' : part.type === 'door' ? 'Hinge_Pilot_8mm' : 'Drawer_5mm';
            dxf += `0\nCIRCLE\n8\n${layer}\n10\n${h.x.toFixed(4)}\n20\n${h.y.toFixed(4)}\n40\n${(h.dia/2).toFixed(4)}\n`;
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        const filename = `${jobNum}_${part.name.replace(/\s+/g, '_')}_${formatDimension(part.width)}x${formatDimension(part.height)}.dxf`.replace(/"/g, '').replace(/mm/g, '');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
        a.download = filename;
        a.click();
    });
}
