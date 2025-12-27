// ShopFlow - Cabinet CNC Configurator
// FIXED: Pilot holes now at correct X position from database

let DB = null;
let parts = [];
let zoomLevel = 1;
let showDimensions = true;
let measureMode = false;
let measureStart = null;
let selectedHingeOID = null;
let canvas, ctx;

let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let previewTransform = {};

document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('preview');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    await loadDatabase();
    initUI();
    loadSampleParts();
});

function resizeCanvas() {
    const container = document.getElementById('preview-container');
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        updatePreview();
    }
}

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
    const partX = (x - t.offsetX - panOffset.x) / t.scale;
    const partY = t.partHeight - (y - t.offsetY - panOffset.y) / t.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY };
        document.getElementById('btn-measure').textContent = 'Click End';
        document.getElementById('measure-result').innerHTML = 'Click second point...';
        updatePreview();
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        document.getElementById('measure-result').innerHTML = 
            `<b>Distance:</b> ${formatFraction(dist)} (${(dist * 25.4).toFixed(1)}mm) &nbsp;|&nbsp; ` +
            `<b>X:</b> ${formatFraction(Math.abs(dx))} &nbsp;|&nbsp; <b>Y:</b> ${formatFraction(Math.abs(dy))}`;
        
        measureStart = null;
        measureMode = false;
        document.getElementById('btn-measure').textContent = 'Measure';
        document.getElementById('btn-measure').classList.remove('active');
        canvas.style.cursor = 'grab';
        updatePreview();
    }
}

async function loadDatabase() {
    try {
        const response = await fetch('data/CabinetSenseDB_combined.json');
        const data = await response.json();
        DB = data.tables;
        
        document.getElementById('db-info').textContent = 
            `${DB.Hole?.length || 0} holes | ${DB.Part?.length || 0} parts`;
        document.getElementById('stat-holes').textContent = DB.Hole?.length || 0;
        
        populateHardwareLists();
        populateHingeTemplates();
    } catch (error) {
        console.error('Database error:', error);
        document.getElementById('db-info').textContent = 'Error';
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

// Get hole pattern from database - each hole has its own X position
function getHingeHolePattern(oid) {
    if (!DB?.Hole) return null;
    const holes = DB.Hole.filter(h => h.OIDPart === String(oid));
    if (!holes.length) return null;
    
    return holes.map(h => ({
        x: parseMM(h.XLocation),      // Each hole's X from edge
        z: parseMM(h.ZLocation),      // Vertical offset from hinge center
        dia: parseMM(h.Diameter),
        depth: parseMM(h.Depth)
    }));
}

function getHingeInfo(oid) {
    return DB?.Part?.find(p => p.OID === String(oid));
}

function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    const hinges = DB?.Part?.filter(p => p.Class === '28') || [];
    
    hingeList.innerHTML = hinges.map(h => {
        const pattern = getHingeHolePattern(h.OID);
        return `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge(${h.OID})">
            <div class="name">${h.Name}</div>
            <div class="details">${pattern?.length || 0} holes</div>
        </div>`;
    }).join('');
    
    if (hinges.length) selectHinge(parseInt(hinges[0].OID));
    
    const slideList = document.getElementById('slide-list');
    slideList.innerHTML = (DB?.SlideSystems || []).map(s => 
        `<div class="hardware-item" data-oid="${s.OID}">
            <div class="name">${s.Name || 'Slide ' + s.OID}</div>
        </div>`
    ).join('');
}

function selectHinge(oid) {
    selectedHingeOID = oid;
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.oid == oid);
    });
    updatePreview();
}

function populateHingeTemplates() {
    const select = document.getElementById('hinge-template');
    if (!DB?.Hinging) return;
    
    select.innerHTML = DB.Hinging.map(h => {
        const hinge = getHingeInfo(h.HingeOID);
        return `<option value="${h.OID}">${h.Template} - ${hinge?.Name || '?'}</option>`;
    }).join('');
    updateHingeTemplate();
}

function updateHingeTemplate() {
    const template = DB?.Hinging?.find(h => h.OID == document.getElementById('hinge-template')?.value);
    if (template) {
        document.getElementById('bottom-hinge').textContent = template.BottomHinge;
        document.getElementById('top-hinge').textContent = template.TopHinge;
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
    canvas.style.cursor = 'grab';
}

function filterHardware(type) {
    const search = document.getElementById(type + '-search').value.toLowerCase();
    document.querySelectorAll(`#${type === 'hinge' ? 'hinge' : 'slide'}-list .hardware-item`).forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
}

function loadSampleParts() {
    parts = [
        { id: 1, name: 'Door 1', width: 15.5, height: 30, type: 'door' },
        { id: 2, name: 'Door 2', width: 18, height: 24, type: 'door' },
        { id: 3, name: 'Drawer 1', width: 18, height: 6, type: 'drawer' },
    ];
    renderParts();
}

function renderParts() {
    document.getElementById('parts-tbody').innerHTML = parts.map(p => `
        <tr data-id="${p.id}">
            <td><input type="checkbox" checked></td>
            <td><input value="${p.name}" onchange="updatePart(${p.id},'name',this.value)" style="width:80px"></td>
            <td><input value="${formatFraction(p.width)}" onchange="updatePart(${p.id},'width',parseFraction(this.value))" style="width:50px"></td>
            <td><input value="${formatFraction(p.height)}" onchange="updatePart(${p.id},'height',parseFraction(this.value))" style="width:50px"></td>
            <td><select onchange="updatePart(${p.id},'type',this.value)">
                <option ${p.type==='door'?'selected':''}>door</option>
                <option ${p.type==='drawer'?'selected':''}>drawer</option>
            </select></td>
            <td><button onclick="removePart(${p.id})" style="border:none;background:none;color:#dc2626;cursor:pointer">X</button></td>
        </tr>
    `).join('');
    updateStats();
    populatePreviewSelect();
    updatePreview();
}

function updatePart(id, field, value) {
    const p = parts.find(x => x.id === id);
    if (p) { p[field] = value; updatePreview(); }
}

function addPart() {
    const id = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    parts.push({ id, name: 'Part ' + id, width: 18, height: 24, type: 'door' });
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
    document.getElementById('preview-select').innerHTML = parts.map(p => 
        `<option value="${p.id}">${p.name} (${formatFraction(p.width)} x ${formatFraction(p.height)})</option>`
    ).join('');
}

function updatePreview() {
    if (!ctx) return;
    
    const part = parts.find(p => p.id == document.getElementById('preview-select')?.value);
    
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!part) return;
    
    const pad = 50;
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
    
    // Holes - now with CORRECT positions from database
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
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        if (showDimensions && r > 8) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(h.dia * 25.4) + '', hx, hy);
        }
    });
    
    // Dimensions
    if (showDimensions) {
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatFraction(part.width), ox + W/2, oy - 15);
        
        ctx.save();
        ctx.translate(ox - 15, oy + H/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillText(formatFraction(part.height), 0, 0);
        ctx.restore();
        
        // Hole callouts
        if (part.type === 'door' && holes.length) {
            const cup = holes.find(h => h.dia > 1);
            const pilot = holes.find(h => h.dia < 1 && h.dia > 0.2);
            
            ctx.fillStyle = '#22d3ee';
            ctx.font = '10px sans-serif';
            
            if (cup) {
                // Cup X position
                ctx.fillText('Cup: ' + (cup.x * 25.4).toFixed(1) + 'mm', ox + 60, oy + H + 20);
            }
            if (pilot) {
                // Pilot X position  
                ctx.fillText('Pilot: ' + (pilot.x * 25.4).toFixed(1) + 'mm', ox + 160, oy + H + 20);
            }
        }
    }
    
    // Legend
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.fillRect(0, canvas.height - 35, canvas.width, 35);
    
    const info = selectedHingeOID ? getHingeInfo(selectedHingeOID) : null;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(info?.Name || 'No hinge selected', 10, canvas.height - 18);
    
    // Legend dots
    ctx.beginPath(); ctx.arc(200, canvas.height - 18, 5, 0, Math.PI*2); ctx.fillStyle = '#dc2626'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText('35mm Cup', 210, canvas.height - 18);
    
    ctx.beginPath(); ctx.arc(290, canvas.height - 18, 4, 0, Math.PI*2); ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText('8mm Pilot', 298, canvas.height - 18);
    
    ctx.beginPath(); ctx.arc(375, canvas.height - 18, 4, 0, Math.PI*2); ctx.fillStyle = '#d97706'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText('Drawer', 383, canvas.height - 18);
    
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(zoomLevel * 100) + '%', canvas.width - 10, canvas.height - 18);
    
    // Measure marker
    if (measureStart) {
        const mx = ox + measureStart.x * scale;
        const my = oy + (part.height - measureStart.y) * scale;
        ctx.beginPath();
        ctx.arc(mx, my, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// FIXED: Get hinge holes with correct X positions for each hole type
function getHingeHoles(part) {
    const holes = [];
    const template = DB?.Hinging?.find(h => h.OID == document.getElementById('hinge-template')?.value);
    const oid = selectedHingeOID || (template?.HingeOID ? parseInt(template.HingeOID) : 73);
    const pattern = getHingeHolePattern(oid);
    
    if (!pattern?.length) return getHingeHolesFallback(part);
    
    // Get Y positions from template
    let bottomY = 3, topY = part.height - 3;
    if (template) {
        const bv = template.BottomHinge.replace(/\[.*?\]/g, '').replace('-','').trim();
        bottomY = parseMM(bv) || 3;
        const tv = template.TopHinge.replace('[top]', '').replace('-','').trim();
        topY = part.height - (parseMM(tv) || 3);
    }
    
    // Add holes at both positions - EACH HOLE KEEPS ITS OWN X!
    [bottomY, topY].forEach(hingeY => {
        pattern.forEach(h => {
            const isCup = h.dia > 1;
            holes.push({
                x: h.x,                    // USE THE HOLE'S OWN X POSITION!
                y: hingeY + h.z,           // Y = hinge position + Z offset
                dia: h.dia,
                depth: h.depth,
                color: isCup ? '#dc2626' : '#16a34a'
            });
        });
    });
    
    return holes;
}

function getHingeHolesFallback(part) {
    const holes = [];
    // Blum specs: Cup at 22.5mm, Pilots at 32mm, Z offset ±22.5mm
    const cupX = 22.5/25.4, pilotX = 32/25.4, zOff = 22.5/25.4;
    const cupD = 35/25.4, pilotD = 8/25.4;
    
    [3, part.height - 3].forEach(y => {
        holes.push({ x: cupX, y, dia: cupD, color: '#dc2626' });
        holes.push({ x: pilotX, y: y - zOff, dia: pilotD, color: '#16a34a' });
        holes.push({ x: pilotX, y: y + zOff, dia: pilotD, color: '#16a34a' });
    });
    return holes;
}

function getDrawerHoles(part) {
    const d = 5/25.4, i = 1.5;
    return [
        { x: i, y: i, dia: d, color: '#d97706' },
        { x: part.width - i, y: i, dia: d, color: '#d97706' },
        { x: i, y: part.height - i, dia: d, color: '#d97706' },
        { x: part.width - i, y: part.height - i, dia: d, color: '#d97706' }
    ];
}

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
    document.getElementById('measure-result').textContent = measureMode ? 'Click first point...' : 'Drag to pan, scroll to zoom';
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
}

function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 5); updatePreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.25); updatePreview(); }
function resetZoom() { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updatePreview(); }

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
    s = s.replace(/"/g, '');
    if (s.includes('-')) { const [w, f] = s.split('-'); return +w + parseFraction(f); }
    if (s.includes('/')) { const [n, d] = s.split('/'); return +n / +d; }
    return +s;
}

function exportSelectedDXF() {
    const part = parts.find(p => p.id == document.getElementById('preview-select').value);
    if (part) generateDXF([part]);
}

function exportAllDXF() {
    const ids = [...document.querySelectorAll('#parts-tbody input[type="checkbox"]:checked')]
        .map(cb => +cb.closest('tr').dataset.id);
    generateDXF(parts.filter(p => ids.includes(p.id)));
}

function generateDXF(list) {
    list.forEach(part => {
        let dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
        ['Outline','Hinge_35mm','Hinge_8mm','Drawer_5mm'].forEach(n => dxf += `0\nLAYER\n2\n${n}\n70\n0\n62\n7\n6\nCONTINUOUS\n`);
        dxf += '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n10\n0\n20\n0\n10\n${part.width}\n20\n0\n10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        (part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part)).forEach(h => {
            const layer = h.dia > 1 ? 'Hinge_35mm' : part.type === 'door' ? 'Hinge_8mm' : 'Drawer_5mm';
            dxf += `0\nCIRCLE\n8\n${layer}\n10\n${h.x}\n20\n${h.y}\n40\n${h.dia/2}\n`;
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
        a.download = part.name.replace(/\s+/g, '_') + '.dxf';
        a.click();
    });
}
