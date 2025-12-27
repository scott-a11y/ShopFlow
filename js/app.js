// ShopFlow - Cabinet CNC Configurator
// Reads manufacturer specs from CabinetSense database

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
    if (!t.scale) return;
    
    const partX = (x - t.offsetX - panOffset.x) / t.scale;
    const partY = t.partHeight - (y - t.offsetY - panOffset.y) / t.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY, screenX: x, screenY: y };
        document.getElementById('btn-measure').textContent = 'Click End Point';
        document.getElementById('measure-result').innerHTML = '<b>Start point set.</b> Click second point to measure.';
        updatePreview();
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Store end point for drawing
        measureStart.endX = partX;
        measureStart.endY = partY;
        measureStart.endScreenX = x;
        measureStart.endScreenY = y;
        measureStart.distance = dist;
        measureStart.dx = dx;
        measureStart.dy = dy;
        
        document.getElementById('measure-result').innerHTML = 
            `<b>Distance:</b> ${formatFraction(dist)} (${(dist * 25.4).toFixed(2)}mm) &nbsp;|&nbsp; ` +
            `<b>ΔX:</b> ${formatFraction(Math.abs(dx))} (${(Math.abs(dx) * 25.4).toFixed(2)}mm) &nbsp;|&nbsp; ` +
            `<b>ΔY:</b> ${formatFraction(Math.abs(dy))} (${(Math.abs(dy) * 25.4).toFixed(2)}mm)`;
        
        updatePreview();
        
        // Reset after showing result
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

async function loadDatabase() {
    try {
        const response = await fetch('data/CabinetSenseDB_combined.json');
        const data = await response.json();
        DB = data.tables;
        
        console.log('Database loaded:', DB);
        console.log('Parts:', DB.Part?.length);
        console.log('Holes:', DB.Hole?.length);
        
        document.getElementById('db-info').textContent = 
            `${DB.Hole?.length || 0} holes | ${DB.Part?.length || 0} parts`;
        document.getElementById('stat-holes').textContent = DB.Hole?.length || 0;
        
        populateHardwareLists();
        populateHingeTemplates();
    } catch (error) {
        console.error('Database error:', error);
        document.getElementById('db-info').textContent = 'Error loading DB';
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

function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    
    // Get all door hinges (Class 28)
    const hinges = DB?.Part?.filter(p => String(p.Class) === '28') || [];
    console.log('Found hinges:', hinges.length, hinges.map(h => h.Name));
    
    if (hinges.length === 0) {
        hingeList.innerHTML = '<div style="padding:10px;color:#666;">No hinges found</div>';
        return;
    }
    
    hingeList.innerHTML = hinges.map(h => {
        const pattern = getHingeHolePattern(h.OID);
        const holeCount = pattern ? pattern.length : 0;
        return `<div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge('${h.OID}')">
            <div class="name">${h.Name || 'Unnamed'}</div>
            <div class="details">${holeCount} holes | Depth: ${pattern?.[0]?.depth ? (pattern[0].depth * 25.4).toFixed(1) + 'mm' : '?'}</div>
        </div>`;
    }).join('');
    
    // Auto-select first hinge
    if (hinges.length > 0) {
        selectHinge(hinges[0].OID);
    }
    
    // Slides
    const slideList = document.getElementById('slide-list');
    const slides = DB?.SlideSystems || [];
    slideList.innerHTML = slides.map(s => 
        `<div class="hardware-item" data-oid="${s.OID}">
            <div class="name">${s.Name || 'Slide ' + s.OID}</div>
        </div>`
    ).join('');
}

function selectHinge(oid) {
    selectedHingeOID = String(oid);
    console.log('Selected hinge:', selectedHingeOID);
    
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', String(el.dataset.oid) === selectedHingeOID);
    });
    
    updatePreview();
}

function populateHingeTemplates() {
    const select = document.getElementById('hinge-template');
    if (!DB?.Hinging) return;
    
    select.innerHTML = DB.Hinging.map(h => {
        const hinge = getHingeInfo(h.HingeOID);
        return `<option value="${h.OID}" data-hinge-oid="${h.HingeOID}">${h.Template} - ${hinge?.Name || 'Unknown'}</option>`;
    }).join('');
    
    select.addEventListener('change', updateHingeTemplate);
    updateHingeTemplate();
}

function updateHingeTemplate() {
    const select = document.getElementById('hinge-template');
    const selectedOption = select.options[select.selectedIndex];
    const template = DB?.Hinging?.find(h => String(h.OID) === select.value);
    
    if (template) {
        document.getElementById('bottom-hinge').textContent = template.BottomHinge;
        document.getElementById('top-hinge').textContent = template.TopHinge;
        
        // Also select the associated hinge
        if (selectedOption?.dataset?.hingeOid) {
            selectHinge(selectedOption.dataset.hingeOid);
        }
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
    
    const pad = 80;
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
    
    // Part background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(ox, oy, W, H);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, W, H);
    
    // Get holes from database
    const holes = part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part);
    
    // Draw holes
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
        
        // Diameter label
        if (r > 10) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(h.dia * 25.4) + '', hx, hy);
        }
    });
    
    // Dimension annotations
    if (showDimensions && part.type === 'door' && holes.length) {
        const cup = holes.find(h => h.isCup);
        const pilot = holes.find(h => !h.isCup);
        
        if (cup) {
            const cupX = ox + cup.x * scale;
            const cupY = oy + (part.height - cup.y) * scale;
            
            // Cup setback from edge
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            
            // Horizontal line from edge to cup
            ctx.beginPath();
            ctx.moveTo(ox, cupY);
            ctx.lineTo(cupX, cupY);
            ctx.stroke();
            
            // Dimension text
            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((cup.x * 25.4).toFixed(1) + 'mm', (ox + cupX) / 2, cupY - 8);
            
            // Pilot offset from cup
            if (pilot) {
                const pilotX = ox + pilot.x * scale;
                const pilotY = oy + (part.height - pilot.y) * scale;
                
                // Dashed line from cup to pilot
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(cupX, cupY);
                ctx.lineTo(pilotX, pilotY);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // X offset dimension
                ctx.beginPath();
                ctx.moveTo(cupX, cupY + 25);
                ctx.lineTo(pilotX, cupY + 25);
                ctx.stroke();
                ctx.fillText((pilot.xOffset * 25.4).toFixed(1) + 'mm', (cupX + pilotX) / 2, cupY + 38);
                
                // Y offset dimension
                ctx.beginPath();
                ctx.moveTo(pilotX + 20, cupY);
                ctx.lineTo(pilotX + 20, pilotY);
                ctx.stroke();
                ctx.save();
                ctx.translate(pilotX + 32, (cupY + pilotY) / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText((Math.abs(pilot.zOffset) * 25.4).toFixed(1) + 'mm', 0, 0);
                ctx.restore();
            }
        }
    }
    
    // Part dimensions
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.setLineDash([]);
    ctx.fillText(formatFraction(part.width), ox + W/2, oy - 20);
    
    ctx.save();
    ctx.translate(ox - 20, oy + H/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText(formatFraction(part.height), 0, 0);
    ctx.restore();
    
    // Measure tool visualization
    if (measureStart) {
        const startX = ox + measureStart.x * scale;
        const startY = oy + (part.height - measureStart.y) * scale;
        
        // Start point
        ctx.beginPath();
        ctx.arc(startX, startY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('1', startX, startY + 4);
        
        // End point and line (if second click made)
        if (measureStart.endX !== undefined) {
            const endX = ox + measureStart.endX * scale;
            const endY = oy + (part.height - measureStart.endY) * scale;
            
            // Line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // End point
            ctx.beginPath();
            ctx.arc(endX, endY, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#22d3ee';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#fff';
            ctx.fillText('2', endX, endY + 4);
            
            // Distance label at midpoint
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(midX - 40, midY - 12, 80, 24);
            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText((measureStart.distance * 25.4).toFixed(2) + 'mm', midX, midY + 4);
        }
    }
    
    // Legend bar
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    
    const info = selectedHingeOID ? getHingeInfo(selectedHingeOID) : null;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(info?.Name || 'Select a hinge', 10, canvas.height - 22);
    
    // Legend
    const lx = 220;
    ctx.beginPath(); ctx.arc(lx, canvas.height - 22, 6, 0, Math.PI*2); ctx.fillStyle = '#dc2626'; ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif';
    ctx.fillText('Cup (35mm)', lx + 12, canvas.height - 22);
    
    ctx.beginPath(); ctx.arc(lx + 100, canvas.height - 22, 5, 0, Math.PI*2); ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.fillText('Pilot (8mm)', lx + 112, canvas.height - 22);
    
    ctx.textAlign = 'right';
    ctx.fillText('Zoom: ' + Math.round(zoomLevel * 100) + '%', canvas.width - 10, canvas.height - 22);
}

function getHingeHoles(part) {
    const holes = [];
    const template = DB?.Hinging?.find(h => String(h.OID) === document.getElementById('hinge-template')?.value);
    const oid = selectedHingeOID || (template?.HingeOID ? String(template.HingeOID) : '73');
    const pattern = getHingeHolePattern(oid);
    
    console.log('Getting holes for hinge OID:', oid, 'Pattern:', pattern);
    
    if (!pattern?.length) {
        console.log('No pattern found, using fallback');
        return getHingeHolesFallback(part);
    }
    
    // Get Y positions from template
    let bottomY = 3, topY = part.height - 3;
    if (template) {
        const bv = template.BottomHinge.replace(/\[.*?\]/g, '').replace('-','').trim();
        bottomY = parseMM(bv) || 3;
        const tv = template.TopHinge.replace('[top]', '').replace('-','').trim();
        topY = part.height - (parseMM(tv) || 3);
    }
    
    // Find cup to calculate relative positions
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
                isCup: isCup,
                xOffset: h.x - cupX,
                zOffset: h.z,
                cupSetback: cupX
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
        holes.push({ x: cupX, y, dia: cupD, color: '#dc2626', isCup: true, xOffset: 0, zOffset: 0, cupSetback: cupX });
        holes.push({ x: pilotX, y: y - zOff, dia: pilotD, color: '#16a34a', isCup: false, xOffset: pilotX - cupX, zOffset: -zOff, cupSetback: cupX });
        holes.push({ x: pilotX, y: y + zOff, dia: pilotD, color: '#16a34a', isCup: false, xOffset: pilotX - cupX, zOffset: zOff, cupSetback: cupX });
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
    document.getElementById('measure-result').textContent = measureMode ? 'Click first point on the part...' : 'Drag to pan, scroll to zoom';
    canvas.style.cursor = measureMode ? 'crosshair' : 'grab';
    updatePreview();
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
