// ShopFlow - Cabinet Production Workflow v5
// Uses CabinetSense database for manufacturer hole specs

let DB = null;
let parts = [];
let zoomLevel = 1;
let showDimensions = true;
let measureMode = false;
let measureStart = null;
let selectedHingeOID = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadDatabase();
    initUI();
    loadSampleParts();
});

// Load the CabinetSense database
async function loadDatabase() {
    try {
        const response = await fetch('data/CabinetSenseDB_combined.json');
        const data = await response.json();
        DB = data.tables;
        
        document.getElementById('db-info').textContent = 
            `CabinetSense: ${DB.Hole?.length || 0} hole ops • ${DB.Part?.length || 0} parts`;
        document.getElementById('stat-holes').textContent = DB.Hole?.length || 0;
        
        populateHardwareLists();
        populateHingeTemplates();
        populateLayers();
        
    } catch (error) {
        console.error('Failed to load database:', error);
        document.getElementById('db-info').textContent = 'Error loading database';
    }
}

// Parse measurement string (handles "22.5mm", "3\"", "32mm", formulas)
function parseMeasurement(str) {
    if (!str || str === '') return 0;
    str = String(str).trim();
    
    // Remove formula parts like [hingeside_x_overlap] for now (treat as 0)
    str = str.replace(/\+?\[.*?\]/g, '').trim();
    
    // Handle mm
    if (str.includes('mm')) {
        return parseFloat(str.replace('mm', '')) / 25.4; // Convert to inches
    }
    
    // Handle inches with quotes
    if (str.includes('"')) {
        return parseFloat(str.replace('"', ''));
    }
    
    // Plain number - assume mm if small, inches if larger
    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return num > 50 ? num / 25.4 : num; // Assume mm if > 50
}

// Get hole pattern for a specific hinge from database
function getHingeHolePattern(hingeOID) {
    if (!DB || !DB.Hole) return null;
    
    const holes = DB.Hole.filter(h => h.OIDPart === String(hingeOID));
    if (holes.length === 0) return null;
    
    return holes.map(h => ({
        xLocation: parseMeasurement(h.XLocation),      // Setback from edge
        yLocation: h.YLocation,                         // Usually empty (set by template)
        zLocation: parseMeasurement(h.ZLocation),      // Offset from center (for pilots)
        diameter: parseMeasurement(h.Diameter),
        depth: parseMeasurement(h.Depth),
        raw: h
    }));
}

// Get hinge info from Part table
function getHingeInfo(hingeOID) {
    if (!DB || !DB.Part) return null;
    return DB.Part.find(p => p.OID === String(hingeOID));
}

// Populate hardware selection lists  
function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    if (DB.Part) {
        // Class 28 = Door Hinge
        const hinges = DB.Part.filter(p => p.Class === '28');
        hingeList.innerHTML = hinges.map(h => {
            const holePattern = getHingeHolePattern(h.OID);
            const holeCount = holePattern ? holePattern.length : 0;
            return `
                <div class="hardware-item" data-oid="${h.OID}" onclick="selectHinge(${h.OID})">
                    <div class="name">${h.Name}</div>
                    <div class="details">${holeCount} holes • OID: ${h.OID}</div>
                </div>
            `;
        }).join('');
        
        // Select first hinge by default
        if (hinges.length > 0) {
            selectHinge(parseInt(hinges[0].OID));
        }
    }
    
    const slideList = document.getElementById('slide-list');
    if (DB.SlideSystems) {
        slideList.innerHTML = DB.SlideSystems.map(s => `
            <div class="hardware-item" data-oid="${s.OID}" onclick="selectHardware('slide', ${s.OID})">
                <div class="name">${s.Name || 'Slide System ' + s.OID}</div>
                <div class="details">OID: ${s.OID}</div>
            </div>
        `).join('');
    }
}

// Select a hinge and update preview
function selectHinge(oid) {
    selectedHingeOID = oid;
    document.querySelectorAll('#hinge-list .hardware-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.oid == oid);
    });
    
    // Show selected hinge info
    const hinge = getHingeInfo(oid);
    const pattern = getHingeHolePattern(oid);
    
    if (hinge && pattern) {
        console.log(`Selected: ${hinge.Name}`, pattern);
    }
    
    updatePreview();
}

// Populate hinge template dropdown
function populateHingeTemplates() {
    const select = document.getElementById('hinge-template');
    if (DB.Hinging) {
        select.innerHTML = DB.Hinging.map(h => {
            const hinge = getHingeInfo(h.HingeOID);
            const hingeName = hinge ? hinge.Name : 'Unknown';
            return `<option value="${h.OID}" data-hinge-oid="${h.HingeOID}">${h.Template} - ${hingeName}</option>`;
        }).join('');
        updateHingeTemplate();
    }
}

// Populate layer names
function populateLayers() {
    const container = document.getElementById('layers-info');
    if (DB.Layers) {
        const layers = DB.Layers;
        const html = Object.entries(layers)
            .filter(([k, v]) => typeof v === 'string' && !k.includes('Strategy'))
            .map(([k, v]) => `<div class="layer-item"><strong>${k}:</strong> ${v}</div>`)
            .join('');
        container.innerHTML = html || 'No layer info';
    }
}

// Update hinge template display and select corresponding hinge
function updateHingeTemplate() {
    const select = document.getElementById('hinge-template');
    const templateId = select.value;
    const template = DB.Hinging?.find(h => h.OID == templateId);
    
    if (template) {
        document.getElementById('bottom-hinge').textContent = template.BottomHinge;
        document.getElementById('top-hinge').textContent = template.TopHinge;
        document.getElementById('max-span').textContent = template.MaxSpan;
        
        // Also select the hinge associated with this template
        if (template.HingeOID) {
            selectHinge(parseInt(template.HingeOID));
        }
    }
}

// Initialize UI elements
function initUI() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        };
    });
    
    const svg = document.getElementById('preview');
    svg.addEventListener('click', handleMeasureClick);
}

// Hardware selection
function selectHardware(type, oid) {
    const listId = type === 'hinge' ? 'hinge-list' : 'slide-list';
    document.querySelectorAll(`#${listId} .hardware-item`).forEach(el => {
        el.classList.toggle('selected', el.dataset.oid == oid);
    });
}

// Filter hardware list
function filterHardware(type) {
    const searchId = type + '-search';
    const listId = type === 'hinge' ? 'hinge-list' : 'slide-list';
    const search = document.getElementById(searchId).value.toLowerCase();
    
    document.querySelectorAll(`#${listId} .hardware-item`).forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(search) ? 'block' : 'none';
    });
}

// Load sample parts
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

// Render parts table
function renderParts() {
    const tbody = document.getElementById('parts-tbody');
    tbody.innerHTML = parts.map(p => `
        <tr data-id="${p.id}">
            <td><input type="checkbox" checked></td>
            <td><input type="text" value="${p.name}" onchange="updatePart(${p.id}, 'name', this.value)"></td>
            <td><input type="text" value="${formatFraction(p.width)}" style="width:65px" onchange="updatePart(${p.id}, 'width', parseFraction(this.value))"></td>
            <td><input type="text" value="${formatFraction(p.height)}" style="width:65px" onchange="updatePart(${p.id}, 'height', parseFraction(this.value))"></td>
            <td>
                <select onchange="updatePart(${p.id}, 'type', this.value)">
                    <option value="door" ${p.type === 'door' ? 'selected' : ''}>Door</option>
                    <option value="drawer" ${p.type === 'drawer' ? 'selected' : ''}>Drawer</option>
                </select>
            </td>
            <td><button onclick="removePart(${p.id})" style="color:#dc2626;border:none;background:none;cursor:pointer;">✕</button></td>
        </tr>
    `).join('');
    
    updateStats();
    populatePreviewSelect();
    updatePreview();
}

function updatePart(id, field, value) {
    const part = parts.find(p => p.id === id);
    if (part) {
        part[field] = value;
        updatePreview();
    }
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
        `<option value="${p.id}">${p.name} (${formatFraction(p.width)} × ${formatFraction(p.height)})</option>`
    ).join('');
}

let previewTransform = { scale: 1, offsetX: 0, offsetY: 0, partHeight: 0 };

// Update preview with holes from database
function updatePreview() {
    const svg = document.getElementById('preview');
    const partId = parseInt(document.getElementById('preview-select').value);
    const part = parts.find(p => p.id === partId);
    
    if (!part) {
        svg.innerHTML = '<text x="50%" y="50%" fill="#64748b" text-anchor="middle">No part selected</text>';
        return;
    }
    
    const svgWidth = svg.clientWidth || 600;
    const svgHeight = svg.clientHeight || 400;
    const padding = 80;
    
    const scaleX = (svgWidth - padding * 2) / part.width;
    const scaleY = (svgHeight - padding * 2) / part.height;
    const scale = Math.min(scaleX, scaleY) * zoomLevel;
    
    const partW = part.width * scale;
    const partH = part.height * scale;
    const offsetX = (svgWidth - partW) / 2;
    const offsetY = (svgHeight - partH) / 2;
    
    previewTransform = { scale, offsetX, offsetY, partHeight: part.height };
    
    let html = '';
    
    // Grid
    html += `<defs>
        <pattern id="grid" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse">
            <path d="M ${scale} 0 L 0 0 0 ${scale}" fill="none" stroke="#334155" stroke-width="0.5" opacity="0.3"/>
        </pattern>
    </defs>`;
    
    html += `<rect x="${offsetX}" y="${offsetY}" width="${partW}" height="${partH}" fill="url(#grid)" stroke="#3b82f6" stroke-width="2"/>`;
    
    // Get holes from database
    const holes = part.type === 'door' ? getHingeHolesFromDB(part) : getDrawerHoles(part);
    
    // Draw holes
    holes.forEach((hole) => {
        const hx = offsetX + hole.x * scale;
        const hy = offsetY + (part.height - hole.y) * scale;
        const radius = Math.max(hole.diameter / 2 * scale, 4);
        
        html += `<circle cx="${hx}" cy="${hy}" r="${radius}" fill="${hole.color}" stroke="#000" stroke-width="1.5"/>`;
        
        if (showDimensions && hole.diameter > 0.5) {
            const diaText = (hole.diameter * 25.4).toFixed(1) + 'mm';
            html += `<text x="${hx}" y="${hy + 4}" fill="#fff" text-anchor="middle" font-size="9" font-weight="bold">${diaText}</text>`;
        }
    });
    
    // Dimension lines
    if (showDimensions) {
        html += drawDimensionLine(offsetX, offsetY - 25, offsetX + partW, offsetY - 25, formatFraction(part.width), 'horizontal');
        html += drawDimensionLine(offsetX - 25, offsetY, offsetX - 25, offsetY + partH, formatFraction(part.height), 'vertical');
        
        // Hole position dimensions for doors
        if (part.type === 'door' && holes.length > 0) {
            const cupHole = holes.find(h => h.diameter > 1); // Find the cup (largest hole)
            if (cupHole) {
                const setbackPx = cupHole.x * scale;
                html += `<line x1="${offsetX}" y1="${offsetY + partH + 15}" x2="${offsetX + setbackPx}" y2="${offsetY + partH + 15}" stroke="#22d3ee" stroke-width="1"/>`;
                html += `<text x="${offsetX + setbackPx/2}" y="${offsetY + partH + 28}" fill="#22d3ee" text-anchor="middle" font-size="10">${formatMM(cupHole.x)}</text>`;
                
                // Bottom hinge position
                const bottomPx = cupHole.y * scale;
                html += `<line x1="${offsetX + partW + 15}" y1="${offsetY + partH}" x2="${offsetX + partW + 15}" y2="${offsetY + partH - bottomPx}" stroke="#22d3ee" stroke-width="1"/>`;
                html += `<text x="${offsetX + partW + 28}" y="${offsetY + partH - bottomPx/2 + 4}" fill="#22d3ee" font-size="10">${formatFraction(cupHole.y)}</text>`;
            }
        }
    }
    
    // Legend with selected hinge info
    const hingeInfo = selectedHingeOID ? getHingeInfo(selectedHingeOID) : null;
    const hingeName = hingeInfo ? hingeInfo.Name : 'None selected';
    
    html += `<g transform="translate(10, ${svgHeight - 70})">
        <text fill="#94a3b8" font-size="11" font-weight="600">HINGE: ${hingeName}</text>
        <circle cx="10" cy="20" r="6" fill="#dc2626"/><text x="22" y="24" fill="#94a3b8" font-size="10">Cup (35mm)</text>
        <circle cx="10" cy="38" r="4" fill="#16a34a"/><text x="22" y="42" fill="#94a3b8" font-size="10">Pilot Hole</text>
        <circle cx="120" cy="20" r="4" fill="#d97706"/><text x="132" y="24" fill="#94a3b8" font-size="10">Drawer</text>
    </g>`;
    
    svg.innerHTML = html;
}

// Get hinge holes from database based on selected hinge
function getHingeHolesFromDB(part) {
    const holes = [];
    
    // Get template settings
    const templateId = document.getElementById('hinge-template').value;
    const template = DB.Hinging?.find(h => h.OID == templateId);
    
    // Hinge OID - prefer selected, fall back to template
    const hingeOID = selectedHingeOID || (template ? parseInt(template.HingeOID) : 73);
    
    // Get hole pattern from database
    const pattern = getHingeHolePattern(hingeOID);
    
    if (!pattern || pattern.length === 0) {
        // Fallback to hardcoded if no pattern found
        console.warn('No hole pattern found for hinge OID:', hingeOID);
        return getHingeHolesFallback(part);
    }
    
    // Get vertical positions from template
    let bottomY = 3; // Default 3"
    let topY = part.height - 3;
    
    if (template) {
        bottomY = parseMeasurement(template.BottomHinge.replace('[top]-', '').replace('[top]', ''));
        if (template.TopHinge.includes('[top]')) {
            const offset = parseMeasurement(template.TopHinge.replace('[top]-', '').replace('[top]', ''));
            topY = part.height - offset;
        }
    }
    
    // Find the cup hole (largest diameter) to get base X position
    const cupHole = pattern.find(h => h.diameter > 1) || pattern[0];
    const baseX = cupHole.xLocation;
    
    // Generate holes at both hinge positions
    [bottomY, topY].forEach(hingeY => {
        pattern.forEach(h => {
            const isCup = h.diameter > 1;
            holes.push({
                x: h.xLocation,
                y: hingeY + h.zLocation, // Z offset is vertical offset from hinge center
                diameter: h.diameter,
                depth: h.depth,
                color: isCup ? '#dc2626' : '#16a34a',
                label: isCup ? 'Cup' : 'Pilot'
            });
        });
    });
    
    return holes;
}

// Fallback if database doesn't have pattern
function getHingeHolesFallback(part) {
    const holes = [];
    const cupDia = 35 / 25.4;
    const pilotDia = 8 / 25.4;
    const pilotOffset = 22.5 / 25.4;
    const edgeSetback = 22.5 / 25.4;
    
    [3, part.height - 3].forEach(hingeY => {
        holes.push({ x: edgeSetback, y: hingeY, diameter: cupDia, color: '#dc2626' });
        holes.push({ x: edgeSetback, y: hingeY - pilotOffset, diameter: pilotDia, color: '#16a34a' });
        holes.push({ x: edgeSetback, y: hingeY + pilotOffset, diameter: pilotDia, color: '#16a34a' });
    });
    
    return holes;
}

// Get drawer attachment holes
function getDrawerHoles(part) {
    const holes = [];
    const holeDia = 5 / 25.4;
    const inset = 1.5;
    
    holes.push({ x: inset, y: inset, diameter: holeDia, color: '#d97706' });
    holes.push({ x: part.width - inset, y: inset, diameter: holeDia, color: '#d97706' });
    holes.push({ x: inset, y: part.height - inset, diameter: holeDia, color: '#d97706' });
    holes.push({ x: part.width - inset, y: part.height - inset, diameter: holeDia, color: '#d97706' });
    
    return holes;
}

// Format as mm for display
function formatMM(inches) {
    return (inches * 25.4).toFixed(1) + 'mm';
}

function drawDimensionLine(x1, y1, x2, y2, text, orientation) {
    let html = '';
    const tickSize = 6;
    
    if (orientation === 'horizontal') {
        html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x1}" y1="${y1 - tickSize}" x2="${x1}" y2="${y1 + tickSize}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x2}" y1="${y2 - tickSize}" x2="${x2}" y2="${y2 + tickSize}" stroke="#fff" stroke-width="1"/>`;
        html += `<text x="${(x1 + x2) / 2}" y="${y1 - 8}" fill="#fff" text-anchor="middle" font-size="13" font-weight="600">${text}</text>`;
    } else {
        html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x1 - tickSize}" y1="${y1}" x2="${x1 + tickSize}" y2="${y1}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x2 - tickSize}" y1="${y2}" x2="${x2 + tickSize}" y2="${y2}" stroke="#fff" stroke-width="1"/>`;
        html += `<text x="${x1 - 10}" y="${(y1 + y2) / 2}" fill="#fff" text-anchor="middle" font-size="13" font-weight="600" transform="rotate(-90, ${x1 - 10}, ${(y1 + y2) / 2})">${text}</text>`;
    }
    
    return html;
}

function toggleDimensions() {
    showDimensions = !showDimensions;
    document.getElementById('btn-dimensions')?.classList.toggle('active', showDimensions);
    updatePreview();
}

function toggleMeasure() {
    measureMode = !measureMode;
    measureStart = null;
    const btn = document.getElementById('btn-measure');
    if (btn) {
        btn.classList.toggle('active', measureMode);
        btn.textContent = measureMode ? '📏 Click 2 pts' : '📏';
    }
    document.getElementById('preview').style.cursor = measureMode ? 'crosshair' : 'default';
}

function handleMeasureClick(e) {
    if (!measureMode) return;
    
    const svg = document.getElementById('preview');
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const partX = (x - previewTransform.offsetX) / previewTransform.scale;
    const partY = previewTransform.partHeight - (y - previewTransform.offsetY) / previewTransform.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY };
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        alert(`Distance: ${formatFraction(distance)} (${formatMM(distance)})\n\nΔX: ${formatFraction(Math.abs(dx))}\nΔY: ${formatFraction(Math.abs(dy))}`);
        
        measureStart = null;
        measureMode = false;
        document.getElementById('btn-measure').textContent = '📏';
        document.getElementById('btn-measure').classList.remove('active');
        document.getElementById('preview').style.cursor = 'default';
    }
}

function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 3); updatePreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.5); updatePreview(); }
function resetZoom() { zoomLevel = 1; updatePreview(); }

function formatFraction(decimal) {
    const whole = Math.floor(decimal);
    const frac = decimal - whole;
    const fractions = [
        [1/16, '1/16'], [1/8, '1/8'], [3/16, '3/16'], [1/4, '1/4'],
        [5/16, '5/16'], [3/8, '3/8'], [7/16, '7/16'], [1/2, '1/2'],
        [9/16, '9/16'], [5/8, '5/8'], [11/16, '11/16'], [3/4, '3/4'],
        [13/16, '13/16'], [7/8, '7/8'], [15/16, '15/16']
    ];
    
    if (frac < 0.03) return whole + '"';
    
    let closest = fractions[0];
    let minDiff = Math.abs(frac - fractions[0][0]);
    for (const [val, str] of fractions) {
        const diff = Math.abs(frac - val);
        if (diff < minDiff) { minDiff = diff; closest = [val, str]; }
    }
    
    return whole > 0 ? `${whole}-${closest[1]}"` : `${closest[1]}"`;
}

function parseFraction(str) {
    str = str.replace(/"/g, '').trim();
    if (str.includes('-')) {
        const [whole, frac] = str.split('-');
        return parseInt(whole) + parseFractionPart(frac);
    }
    if (str.includes('/')) return parseFractionPart(str);
    return parseFloat(str);
}

function parseFractionPart(str) {
    const [num, den] = str.split('/').map(Number);
    return num / den;
}

function exportSelectedDXF() {
    const partId = parseInt(document.getElementById('preview-select').value);
    const part = parts.find(p => p.id === partId);
    if (part) generateDXF([part]);
}

function exportAllDXF() {
    const checked = [...document.querySelectorAll('#parts-tbody input[type="checkbox"]:checked')]
        .map(cb => parseInt(cb.closest('tr').dataset.id));
    const selectedParts = parts.filter(p => checked.includes(p.id));
    if (selectedParts.length > 0) generateDXF(selectedParts);
}

function generateDXF(partsToExport) {
    partsToExport.forEach(part => {
        let dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n';
        dxf += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
        
        const layers = ['Outline', 'Door_Hinge_35mm_13mm', 'Door_Hinge_8mm_13mm', 'Drawer_Lock_5mm'];
        layers.forEach(name => {
            dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
        });
        dxf += '0\nENDTAB\n0\nENDSEC\n';
        
        dxf += '0\nSECTION\n2\nENTITIES\n';
        
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n`;
        dxf += `10\n0\n20\n0\n10\n${part.width}\n20\n0\n`;
        dxf += `10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        const holes = part.type === 'door' ? getHingeHolesFromDB(part) : getDrawerHoles(part);
        holes.forEach(hole => {
            const depthMM = Math.round((hole.depth || 0.5) * 25.4);
            const diaMM = Math.round(hole.diameter * 25.4);
            let layer = hole.diameter > 1 ? `Door_Hinge_${diaMM}mm_${depthMM}mm` : 
                        part.type === 'door' ? `Door_Hinge_${diaMM}mm_${depthMM}mm` : 'Drawer_Lock_5mm';
            dxf += `0\nCIRCLE\n8\n${layer}\n10\n${hole.x}\n20\n${hole.y}\n40\n${hole.diameter/2}\n`;
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${part.name.replace(/\s+/g, '_')}.dxf`;
        a.click();
        URL.revokeObjectURL(url);
    });
}
