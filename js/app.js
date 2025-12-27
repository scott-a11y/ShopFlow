// ShopFlow - Cabinet CNC Configurator
// Uses Canvas for reliable preview and measurement

let DB = null;
let parts = [];
let zoomLevel = 1;
let showDimensions = true;
let measureMode = false;
let measureStart = null;
let selectedHingeOID = null;
let canvas, ctx;
let previewTransform = { scale: 1, offsetX: 0, offsetY: 0, partWidth: 0, partHeight: 0 };

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('preview');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Canvas click handler for measure tool
    canvas.addEventListener('click', handleCanvasClick);
    
    await loadDatabase();
    initUI();
    loadSampleParts();
});

function resizeCanvas() {
    const container = document.getElementById('preview-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    updatePreview();
}

// Load database
async function loadDatabase() {
    try {
        const response = await fetch('data/CabinetSenseDB_combined.json');
        const data = await response.json();
        DB = data.tables;
        
        document.getElementById('db-info').textContent = 
            `CabinetSense: ${DB.Hole?.length || 0} holes | ${DB.Part?.length || 0} parts`;
        document.getElementById('stat-holes').textContent = DB.Hole?.length || 0;
        
        populateHardwareLists();
        populateHingeTemplates();
        populateLayers();
    } catch (error) {
        console.error('Failed to load database:', error);
        document.getElementById('db-info').textContent = 'Error loading database';
    }
}

// Parse measurement (handles "22.5mm", "3\"", etc.)
function parseMeasurement(str) {
    if (!str || str === '') return 0;
    str = String(str).trim();
    str = str.replace(/\+?\[.*?\]/g, '').trim();
    
    if (str.includes('mm')) {
        return parseFloat(str.replace('mm', '')) / 25.4;
    }
    if (str.includes('"')) {
        return parseFloat(str.replace('"', ''));
    }
    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return num > 50 ? num / 25.4 : num;
}

// Get hole pattern for hinge from database
function getHingeHolePattern(hingeOID) {
    if (!DB || !DB.Hole) return null;
    const holes = DB.Hole.filter(h => h.OIDPart === String(hingeOID));
    if (holes.length === 0) return null;
    
    return holes.map(h => ({
        xLocation: parseMeasurement(h.XLocation),
        zLocation: parseMeasurement(h.ZLocation),
        diameter: parseMeasurement(h.Diameter),
        depth: parseMeasurement(h.Depth)
    }));
}

function getHingeInfo(hingeOID) {
    if (!DB || !DB.Part) return null;
    return DB.Part.find(p => p.OID === String(hingeOID));
}

// Populate hardware lists
function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    if (DB.Part) {
        const hinges = DB.Part.filter(p => p.Class === '28');
        hingeList.innerHTML = hinges.map(h => {
            const pattern = getHingeHolePattern(h.OID);
            const count = pattern ? pattern.length : 0;
            return `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge(${h.OID})">
                <div class="name">${h.Name}</div>
                <div class="details">${count} holes | OID: ${h.OID}</div>
            </div>`;
        }).join('');
        
        if (hinges.length > 0) selectHinge(parseInt(hinges[0].OID));
    }
    
    const slideList = document.getElementById('slide-list');
    if (DB.SlideSystems) {
        slideList.innerHTML = DB.SlideSystems.map(s => 
            `<div class="hardware-item" data-oid="${s.OID}" onclick="selectSlide(${s.OID})">
                <div class="name">${s.Name || 'Slide ' + s.OID}</div>
                <div class="details">OID: ${s.OID}</div>
            </div>`
        ).join('');
    }
}

function selectHinge(oid) {
    selectedHingeOID = oid;
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.oid == oid);
    });
    updatePreview();
}

function selectSlide(oid) {
    document.querySelectorAll('#slide-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.oid == oid);
    });
}

function populateHingeTemplates() {
    const select = document.getElementById('hinge-template');
    if (DB.Hinging) {
        select.innerHTML = DB.Hinging.map(h => {
            const hinge = getHingeInfo(h.HingeOID);
            const name = hinge ? hinge.Name : 'Unknown';
            return `<option value="${h.OID}" data-hinge="${h.HingeOID}">${h.Template} - ${name}</option>`;
        }).join('');
        updateHingeTemplate();
    }
}

function populateLayers() {
    const container = document.getElementById('layers-info');
    if (DB.Layers) {
        const html = Object.entries(DB.Layers)
            .filter(([k, v]) => typeof v === 'string' && !k.includes('Strategy'))
            .map(([k, v]) => `<div class="layer-item"><strong>${k}:</strong> ${v}</div>`)
            .join('');
        container.innerHTML = html || 'No layer info';
    }
}

function updateHingeTemplate() {
    const select = document.getElementById('hinge-template');
    const template = DB.Hinging?.find(h => h.OID == select.value);
    if (template) {
        document.getElementById('bottom-hinge').textContent = template.BottomHinge;
        document.getElementById('top-hinge').textContent = template.TopHinge;
        document.getElementById('max-span').textContent = template.MaxSpan;
        if (template.HingeOID) selectHinge(parseInt(template.HingeOID));
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
}

function filterHardware(type) {
    const search = document.getElementById(type + '-search').value.toLowerCase();
    const listId = type === 'hinge' ? 'hinge-list' : 'slide-list';
    document.querySelectorAll(`#${listId} .hardware-item`).forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(search) ? 'block' : 'none';
    });
}

// Parts management
function loadSampleParts() {
    parts = [
        { id: 1, name: 'Upper Left Door', width: 15.5, height: 30, type: 'door' },
        { id: 2, name: 'Upper Right Door', width: 15.5, height: 30, type: 'door' },
        { id: 3, name: 'Base Door', width: 18, height: 24, type: 'door' },
        { id: 4, name: 'Drawer Front 1', width: 18, height: 6, type: 'drawer' },
        { id: 5, name: 'Drawer Front 2', width: 18, height: 8, type: 'drawer' },
    ];
    renderParts();
}

function renderParts() {
    const tbody = document.getElementById('parts-tbody');
    tbody.innerHTML = parts.map(p => `
        <tr data-id="${p.id}">
            <td><input type="checkbox" checked></td>
            <td><input type="text" value="${p.name}" onchange="updatePart(${p.id},'name',this.value)"></td>
            <td><input type="text" value="${formatFraction(p.width)}" style="width:60px" onchange="updatePart(${p.id},'width',parseFraction(this.value))"></td>
            <td><input type="text" value="${formatFraction(p.height)}" style="width:60px" onchange="updatePart(${p.id},'height',parseFraction(this.value))"></td>
            <td><select onchange="updatePart(${p.id},'type',this.value)">
                <option value="door" ${p.type==='door'?'selected':''}>Door</option>
                <option value="drawer" ${p.type==='drawer'?'selected':''}>Drawer</option>
            </select></td>
            <td><button onclick="removePart(${p.id})" style="color:#dc2626;border:none;background:none;cursor:pointer;">X</button></td>
        </tr>
    `).join('');
    updateStats();
    populatePreviewSelect();
    updatePreview();
}

function updatePart(id, field, value) {
    const part = parts.find(p => p.id === id);
    if (part) { part[field] = value; updatePreview(); }
}

function addPart() {
    const maxId = parts.length > 0 ? Math.max(...parts.map(p => p.id)) : 0;
    parts.push({ id: maxId + 1, name: `Part ${maxId + 1}`, width: 18, height: 24, type: 'door' });
    renderParts();
}

function removePart(id) {
    parts = parts.filter(p => p.id !== id);
    renderParts();
}

function updateStats() {
    document.getElementById('stat-parts').textContent = parts.length;
    document.getElementById('stat-doors').textContent = parts.filter(p => p.type === 'door').length;
    document.getElementById('stat-drawers').textContent = parts.filter(p => p.type === 'drawer').length;
}

function populatePreviewSelect() {
    const select = document.getElementById('preview-select');
    select.innerHTML = parts.map(p => 
        `<option value="${p.id}">${p.name} (${formatFraction(p.width)} x ${formatFraction(p.height)})</option>`
    ).join('');
}

// Canvas Preview
function updatePreview() {
    if (!ctx) return;
    
    const partId = parseInt(document.getElementById('preview-select')?.value);
    const part = parts.find(p => p.id === partId);
    
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!part) {
        ctx.fillStyle = '#64748b';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No part selected', canvas.width/2, canvas.height/2);
        return;
    }
    
    const padding = 80;
    const scaleX = (canvas.width - padding * 2) / part.width;
    const scaleY = (canvas.height - padding * 2) / part.height;
    const scale = Math.min(scaleX, scaleY) * zoomLevel;
    
    const partW = part.width * scale;
    const partH = part.height * scale;
    const offsetX = (canvas.width - partW) / 2;
    const offsetY = (canvas.height - partH) / 2;
    
    previewTransform = { scale, offsetX, offsetY, partWidth: part.width, partHeight: part.height };
    
    // Draw grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= part.width; x++) {
        const px = offsetX + x * scale;
        ctx.beginPath();
        ctx.moveTo(px, offsetY);
        ctx.lineTo(px, offsetY + partH);
        ctx.stroke();
    }
    for (let y = 0; y <= part.height; y++) {
        const py = offsetY + (part.height - y) * scale;
        ctx.beginPath();
        ctx.moveTo(offsetX, py);
        ctx.lineTo(offsetX + partW, py);
        ctx.stroke();
    }
    
    // Draw part outline
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, partW, partH);
    
    // Get holes
    const holes = part.type === 'door' ? getHingeHolesFromDB(part) : getDrawerHoles(part);
    
    // Draw holes
    holes.forEach(hole => {
        const hx = offsetX + hole.x * scale;
        const hy = offsetY + (part.height - hole.y) * scale;
        const radius = Math.max(hole.diameter / 2 * scale, 4);
        
        ctx.beginPath();
        ctx.arc(hx, hy, radius, 0, Math.PI * 2);
        ctx.fillStyle = hole.color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Hole label
        if (showDimensions && hole.diameter > 0.5) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((hole.diameter * 25.4).toFixed(0) + 'mm', hx, hy + 3);
        }
    });
    
    // Dimensions
    if (showDimensions) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        
        // Width (top)
        ctx.fillText(formatFraction(part.width), offsetX + partW/2, offsetY - 20);
        drawDimLine(offsetX, offsetY - 10, offsetX + partW, offsetY - 10);
        
        // Height (left)
        ctx.save();
        ctx.translate(offsetX - 20, offsetY + partH/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillText(formatFraction(part.height), 0, 0);
        ctx.restore();
        drawDimLine(offsetX - 10, offsetY, offsetX - 10, offsetY + partH);
        
        // Hole positions
        if (holes.length > 0 && part.type === 'door') {
            const cup = holes.find(h => h.diameter > 1);
            if (cup) {
                ctx.fillStyle = '#22d3ee';
                ctx.font = '10px sans-serif';
                
                // Edge setback
                const setbackPx = cup.x * scale;
                ctx.fillText(formatMM(cup.x), offsetX + setbackPx/2, offsetY + partH + 25);
                ctx.beginPath();
                ctx.moveTo(offsetX, offsetY + partH + 15);
                ctx.lineTo(offsetX + setbackPx, offsetY + partH + 15);
                ctx.strokeStyle = '#22d3ee';
                ctx.stroke();
                
                // Bottom hinge position
                ctx.fillText(formatFraction(cup.y), offsetX + partW + 35, offsetY + partH - (cup.y * scale / 2));
            }
        }
    }
    
    // Legend
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    const hingeInfo = selectedHingeOID ? getHingeInfo(selectedHingeOID) : null;
    ctx.fillText('Hinge: ' + (hingeInfo ? hingeInfo.Name : 'None'), 10, canvas.height - 50);
    
    // Legend circles
    ctx.beginPath(); ctx.arc(15, canvas.height - 30, 5, 0, Math.PI*2); ctx.fillStyle = '#dc2626'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText('Cup (35mm)', 25, canvas.height - 26);
    
    ctx.beginPath(); ctx.arc(120, canvas.height - 30, 4, 0, Math.PI*2); ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText('Pilot', 130, canvas.height - 26);
    
    ctx.beginPath(); ctx.arc(180, canvas.height - 30, 4, 0, Math.PI*2); ctx.fillStyle = '#d97706'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText('Drawer', 190, canvas.height - 26);
    
    // Measure start point marker
    if (measureStart) {
        ctx.beginPath();
        ctx.arc(measureStart.screenX, measureStart.screenY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawDimLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Ticks
    const tick = 5;
    if (y1 === y2) { // Horizontal
        ctx.beginPath();
        ctx.moveTo(x1, y1 - tick); ctx.lineTo(x1, y1 + tick);
        ctx.moveTo(x2, y2 - tick); ctx.lineTo(x2, y2 + tick);
        ctx.stroke();
    } else { // Vertical
        ctx.beginPath();
        ctx.moveTo(x1 - tick, y1); ctx.lineTo(x1 + tick, y1);
        ctx.moveTo(x2 - tick, y2); ctx.lineTo(x2 + tick, y2);
        ctx.stroke();
    }
}

// Get hinge holes from database
function getHingeHolesFromDB(part) {
    const holes = [];
    const templateId = document.getElementById('hinge-template')?.value;
    const template = DB?.Hinging?.find(h => h.OID == templateId);
    const hingeOID = selectedHingeOID || (template ? parseInt(template.HingeOID) : 73);
    const pattern = getHingeHolePattern(hingeOID);
    
    if (!pattern || pattern.length === 0) return getHingeHolesFallback(part);
    
    let bottomY = 3, topY = part.height - 3;
    if (template) {
        bottomY = parseMeasurement(template.BottomHinge.replace('[top]-', '').replace('[top]', ''));
        if (template.TopHinge.includes('[top]')) {
            topY = part.height - parseMeasurement(template.TopHinge.replace('[top]-', '').replace('[top]', ''));
        }
    }
    
    [bottomY, topY].forEach(hingeY => {
        pattern.forEach(h => {
            const isCup = h.diameter > 1;
            holes.push({
                x: h.xLocation,
                y: hingeY + h.zLocation,
                diameter: h.diameter,
                depth: h.depth,
                color: isCup ? '#dc2626' : '#16a34a'
            });
        });
    });
    
    return holes;
}

function getHingeHolesFallback(part) {
    const holes = [];
    const cup = 35 / 25.4, pilot = 8 / 25.4, offset = 22.5 / 25.4, setback = 22.5 / 25.4;
    [3, part.height - 3].forEach(y => {
        holes.push({ x: setback, y: y, diameter: cup, color: '#dc2626' });
        holes.push({ x: setback, y: y - offset, diameter: pilot, color: '#16a34a' });
        holes.push({ x: setback, y: y + offset, diameter: pilot, color: '#16a34a' });
    });
    return holes;
}

function getDrawerHoles(part) {
    const dia = 5 / 25.4, inset = 1.5;
    return [
        { x: inset, y: inset, diameter: dia, color: '#d97706' },
        { x: part.width - inset, y: inset, diameter: dia, color: '#d97706' },
        { x: inset, y: part.height - inset, diameter: dia, color: '#d97706' },
        { x: part.width - inset, y: part.height - inset, diameter: dia, color: '#d97706' }
    ];
}

// Canvas click handler
function handleCanvasClick(e) {
    if (!measureMode) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const partX = (x - previewTransform.offsetX) / previewTransform.scale;
    const partY = previewTransform.partHeight - (y - previewTransform.offsetY) / previewTransform.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY, screenX: x, screenY: y };
        document.getElementById('btn-measure').textContent = 'Click End Point';
        document.getElementById('measure-result').textContent = 'Click second point to measure...';
        updatePreview();
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        document.getElementById('measure-result').innerHTML = 
            `<strong>Distance:</strong> ${formatFraction(dist)} (${formatMM(dist)}) | ` +
            `<strong>dX:</strong> ${formatFraction(Math.abs(dx))} | ` +
            `<strong>dY:</strong> ${formatFraction(Math.abs(dy))}`;
        
        measureStart = null;
        measureMode = false;
        document.getElementById('btn-measure').textContent = 'Measure';
        document.getElementById('btn-measure').classList.remove('active');
        canvas.style.cursor = 'default';
        updatePreview();
    }
}

// Controls
function toggleDimensions() {
    showDimensions = !showDimensions;
    document.getElementById('btn-dimensions').classList.toggle('active', showDimensions);
    updatePreview();
}

function toggleMeasure() {
    measureMode = !measureMode;
    measureStart = null;
    document.getElementById('btn-measure').classList.toggle('active', measureMode);
    document.getElementById('btn-measure').textContent = measureMode ? 'Click Start Point' : 'Measure';
    document.getElementById('measure-result').textContent = measureMode ? 'Click first point on the part...' : '';
    canvas.style.cursor = measureMode ? 'crosshair' : 'default';
    updatePreview();
}

function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 3); updatePreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.5); updatePreview(); }
function resetZoom() { zoomLevel = 1; updatePreview(); }

// Formatting
function formatFraction(decimal) {
    const whole = Math.floor(decimal);
    const frac = decimal - whole;
    const fractions = [[1/16,'1/16'],[1/8,'1/8'],[3/16,'3/16'],[1/4,'1/4'],[5/16,'5/16'],[3/8,'3/8'],[7/16,'7/16'],[1/2,'1/2'],[9/16,'9/16'],[5/8,'5/8'],[11/16,'11/16'],[3/4,'3/4'],[13/16,'13/16'],[7/8,'7/8'],[15/16,'15/16']];
    if (frac < 0.03) return whole + '"';
    let closest = fractions[0], minDiff = Math.abs(frac - fractions[0][0]);
    for (const [v, s] of fractions) { const d = Math.abs(frac - v); if (d < minDiff) { minDiff = d; closest = [v, s]; } }
    return whole > 0 ? `${whole}-${closest[1]}"` : `${closest[1]}"`;
}

function parseFraction(str) {
    str = str.replace(/"/g, '').trim();
    if (str.includes('-')) { const [w, f] = str.split('-'); return parseInt(w) + parseFractionPart(f); }
    if (str.includes('/')) return parseFractionPart(str);
    return parseFloat(str);
}

function parseFractionPart(str) { const [n, d] = str.split('/').map(Number); return n / d; }

function formatMM(inches) { return (inches * 25.4).toFixed(1) + 'mm'; }

// DXF Export
function exportSelectedDXF() {
    const partId = parseInt(document.getElementById('preview-select').value);
    const part = parts.find(p => p.id === partId);
    if (part) generateDXF([part]);
}

function exportAllDXF() {
    const checked = [...document.querySelectorAll('#parts-tbody input[type="checkbox"]:checked')]
        .map(cb => parseInt(cb.closest('tr').dataset.id));
    const selected = parts.filter(p => checked.includes(p.id));
    if (selected.length > 0) generateDXF(selected);
}

function generateDXF(partsToExport) {
    partsToExport.forEach(part => {
        let dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n';
        dxf += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
        ['Outline', 'Door_Hinge_35mm', 'Door_Hinge_8mm', 'Drawer_5mm'].forEach(name => {
            dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
        });
        dxf += '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
        
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n10\n0\n20\n0\n10\n${part.width}\n20\n0\n10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        const holes = part.type === 'door' ? getHingeHolesFromDB(part) : getDrawerHoles(part);
        holes.forEach(h => {
            const layer = h.diameter > 1 ? 'Door_Hinge_35mm' : part.type === 'door' ? 'Door_Hinge_8mm' : 'Drawer_5mm';
            dxf += `0\nCIRCLE\n8\n${layer}\n10\n${h.x}\n20\n${h.y}\n40\n${h.diameter/2}\n`;
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${part.name.replace(/\s+/g, '_')}.dxf`;
        a.click();
    });
}
