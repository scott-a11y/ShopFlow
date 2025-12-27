// ShopFlow - Cabinet Production Workflow v5
let DB = null;
let parts = [];
let zoomLevel = 1;
let showDimensions = true;
let measureMode = false;
let measureStart = null;

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
            `CabinetSense: ${DB.Hole?.length || 0} hole ops • ${DB.Part?.length || 0} parts • Exported: ${data.exported}`;
        document.getElementById('stat-holes').textContent = DB.Hole?.length || 0;
        
        populateHardwareLists();
        populateHingeTemplates();
        populateLayers();
        
    } catch (error) {
        console.error('Failed to load database:', error);
        document.getElementById('db-info').textContent = 'Error loading database';
    }
}

// Populate hardware selection lists
function populateHardwareLists() {
    const hingeList = document.getElementById('hinge-list');
    if (DB.Part) {
        const hinges = DB.Part.filter(p => p.Class === '28' || p.Class === '15');
        hingeList.innerHTML = hinges.map(h => `
            <div class="hardware-item" data-oid="${h.OID}" onclick="selectHardware('hinge', ${h.OID})">
                <div class="name">${h.Name}</div>
                <div class="details">${h.Mfg || 'Generic'} • ${h.PartNumber || 'N/A'}</div>
            </div>
        `).join('');
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

// Populate hinge template dropdown
function populateHingeTemplates() {
    const select = document.getElementById('hinge-template');
    if (DB.Hinging) {
        select.innerHTML = DB.Hinging.map(h => 
            `<option value="${h.OID}">${h.Template}${h.HingeName ? ' (' + h.HingeName + ')' : ''}</option>`
        ).join('');
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

// Update hinge template display
function updateHingeTemplate() {
    const templateId = document.getElementById('hinge-template').value;
    const template = DB.Hinging?.find(h => h.OID == templateId);
    if (template) {
        document.getElementById('bottom-hinge').textContent = template.BottomHinge;
        document.getElementById('top-hinge').textContent = template.TopHinge;
        document.getElementById('max-span').textContent = template.MaxSpan;
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
    
    // Measure tool - click handling on SVG
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

// Update a part property
function updatePart(id, field, value) {
    const part = parts.find(p => p.id === id);
    if (part) {
        part[field] = value;
        updatePreview();
    }
}

// Add new part
function addPart() {
    const maxId = parts.length > 0 ? Math.max(...parts.map(p => p.id)) : 0;
    parts.push({
        id: maxId + 1,
        name: `Part ${maxId + 1}`,
        width: 18,
        height: 24,
        type: 'door'
    });
    renderParts();
}

// Remove part
function removePart(id) {
    parts = parts.filter(p => p.id !== id);
    renderParts();
}

// Update statistics
function updateStats() {
    document.getElementById('stat-parts').textContent = parts.length;
    document.getElementById('stat-doors').textContent = parts.filter(p => p.type === 'door').length;
    document.getElementById('stat-drawers').textContent = parts.filter(p => p.type === 'drawer').length;
}

// Populate preview dropdown
function populatePreviewSelect() {
    const select = document.getElementById('preview-select');
    select.innerHTML = parts.map(p => 
        `<option value="${p.id}">${p.name} (${formatFraction(p.width)} × ${formatFraction(p.height)})</option>`
    ).join('');
}

// Store preview transform for measure tool
let previewTransform = { scale: 1, offsetX: 0, offsetY: 0, partHeight: 0 };

// Update preview SVG with dimensions
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
    
    // Store for measure tool
    previewTransform = { scale, offsetX, offsetY, partHeight: part.height };
    
    let html = '';
    
    // Grid background
    html += `<defs>
        <pattern id="grid" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse">
            <path d="M ${scale} 0 L 0 0 0 ${scale}" fill="none" stroke="#334155" stroke-width="0.5" opacity="0.3"/>
        </pattern>
    </defs>`;
    
    // Part outline with grid
    html += `<rect x="${offsetX}" y="${offsetY}" width="${partW}" height="${partH}" fill="url(#grid)" stroke="#3b82f6" stroke-width="2"/>`;
    
    // Get holes based on part type
    const holes = part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part);
    
    // Draw holes with labels
    holes.forEach((hole, i) => {
        const hx = offsetX + hole.x * scale;
        const hy = offsetY + (part.height - hole.y) * scale;
        const radius = Math.max(hole.diameter / 2 * scale, 4);
        
        // Hole circle
        html += `<circle cx="${hx}" cy="${hy}" r="${radius}" fill="${hole.color}" stroke="#000" stroke-width="1.5"/>`;
        
        // Hole label (diameter)
        if (showDimensions && hole.diameter > 0.5) {
            const diaText = (hole.diameter * 25.4).toFixed(0) + 'mm';
            html += `<text x="${hx}" y="${hy + 4}" fill="#fff" text-anchor="middle" font-size="10" font-weight="bold">${diaText}</text>`;
        }
    });
    
    // Dimension lines if enabled
    if (showDimensions) {
        // Overall width (top)
        html += drawDimensionLine(offsetX, offsetY - 25, offsetX + partW, offsetY - 25, formatFraction(part.width), 'horizontal');
        
        // Overall height (left)
        html += drawDimensionLine(offsetX - 25, offsetY, offsetX - 25, offsetY + partH, formatFraction(part.height), 'vertical');
        
        // Hole position dimensions
        if (part.type === 'door' && holes.length > 0) {
            const edgeSetback = holes[0].x;
            const bottomHingeY = 3;
            const topHingeY = part.height - 3;
            
            // Edge setback (bottom)
            const setbackPx = edgeSetback * scale;
            html += `<line x1="${offsetX}" y1="${offsetY + partH + 15}" x2="${offsetX + setbackPx}" y2="${offsetY + partH + 15}" stroke="#22d3ee" stroke-width="1"/>`;
            html += `<text x="${offsetX + setbackPx/2}" y="${offsetY + partH + 28}" fill="#22d3ee" text-anchor="middle" font-size="11">${formatFraction(edgeSetback)}</text>`;
            
            // Bottom hinge from bottom edge (right side)
            const bottomPx = bottomHingeY * scale;
            html += `<line x1="${offsetX + partW + 15}" y1="${offsetY + partH}" x2="${offsetX + partW + 15}" y2="${offsetY + partH - bottomPx}" stroke="#22d3ee" stroke-width="1"/>`;
            html += `<text x="${offsetX + partW + 30}" y="${offsetY + partH - bottomPx/2 + 4}" fill="#22d3ee" font-size="11">3"</text>`;
            
            // Top hinge from top edge
            html += `<line x1="${offsetX + partW + 15}" y1="${offsetY}" x2="${offsetX + partW + 15}" y2="${offsetY + bottomPx}" stroke="#22d3ee" stroke-width="1"/>`;
            html += `<text x="${offsetX + partW + 30}" y="${offsetY + bottomPx/2 + 4}" fill="#22d3ee" font-size="11">3"</text>`;
        }
        
        if (part.type === 'drawer' && holes.length > 0) {
            const inset = holes[0].x;
            const insetPx = inset * scale;
            
            // Corner inset dimension
            html += `<line x1="${offsetX}" y1="${offsetY + partH + 15}" x2="${offsetX + insetPx}" y2="${offsetY + partH + 15}" stroke="#22d3ee" stroke-width="1"/>`;
            html += `<text x="${offsetX + insetPx/2}" y="${offsetY + partH + 28}" fill="#22d3ee" text-anchor="middle" font-size="11">${formatFraction(inset)}</text>`;
        }
    }
    
    // Legend
    html += `<g transform="translate(10, ${svgHeight - 60})">
        <text fill="#94a3b8" font-size="11" font-weight="600">LEGEND:</text>
        <circle cx="10" cy="20" r="6" fill="#dc2626"/><text x="22" y="24" fill="#94a3b8" font-size="10">35mm Hinge Cup</text>
        <circle cx="10" cy="38" r="4" fill="#16a34a"/><text x="22" y="42" fill="#94a3b8" font-size="10">5mm Pilot Hole</text>
        <circle cx="120" cy="20" r="4" fill="#d97706"/><text x="132" y="24" fill="#94a3b8" font-size="10">Drawer Attachment</text>
    </g>`;
    
    svg.innerHTML = html;
}

// Draw a dimension line with text
function drawDimensionLine(x1, y1, x2, y2, text, orientation) {
    let html = '';
    const tickSize = 6;
    
    if (orientation === 'horizontal') {
        // Horizontal dimension
        html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x1}" y1="${y1 - tickSize}" x2="${x1}" y2="${y1 + tickSize}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x2}" y1="${y2 - tickSize}" x2="${x2}" y2="${y2 + tickSize}" stroke="#fff" stroke-width="1"/>`;
        html += `<text x="${(x1 + x2) / 2}" y="${y1 - 8}" fill="#fff" text-anchor="middle" font-size="13" font-weight="600">${text}</text>`;
    } else {
        // Vertical dimension
        html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x1 - tickSize}" y1="${y1}" x2="${x1 + tickSize}" y2="${y1}" stroke="#fff" stroke-width="1"/>`;
        html += `<line x1="${x2 - tickSize}" y1="${y2}" x2="${x2 + tickSize}" y2="${y2}" stroke="#fff" stroke-width="1"/>`;
        html += `<text x="${x1 - 10}" y="${(y1 + y2) / 2}" fill="#fff" text-anchor="middle" font-size="13" font-weight="600" transform="rotate(-90, ${x1 - 10}, ${(y1 + y2) / 2})">${text}</text>`;
    }
    
    return html;
}

// Toggle dimension display
function toggleDimensions() {
    showDimensions = !showDimensions;
    const btn = document.getElementById('btn-dimensions');
    if (btn) btn.classList.toggle('active', showDimensions);
    updatePreview();
}

// Toggle measure mode
function toggleMeasure() {
    measureMode = !measureMode;
    measureStart = null;
    const btn = document.getElementById('btn-measure');
    if (btn) {
        btn.classList.toggle('active', measureMode);
        btn.textContent = measureMode ? '📏 Click 2 points' : '📏';
    }
    document.getElementById('preview').style.cursor = measureMode ? 'crosshair' : 'default';
}

// Handle measure click
function handleMeasureClick(e) {
    if (!measureMode) return;
    
    const svg = document.getElementById('preview');
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert to part coordinates
    const partX = (x - previewTransform.offsetX) / previewTransform.scale;
    const partY = previewTransform.partHeight - (y - previewTransform.offsetY) / previewTransform.scale;
    
    if (!measureStart) {
        measureStart = { x: partX, y: partY, px: x, py: y };
    } else {
        const dx = partX - measureStart.x;
        const dy = partY - measureStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        alert(`Distance: ${formatFraction(distance)}\n\nX: ${formatFraction(Math.abs(dx))}\nY: ${formatFraction(Math.abs(dy))}`);
        
        measureStart = null;
        measureMode = false;
        document.getElementById('btn-measure').textContent = '📏';
        document.getElementById('btn-measure').classList.remove('active');
        svg.style.cursor = 'default';
    }
}

// Get hinge hole positions for a door
function getHingeHoles(part) {
    const holes = [];
    const cupDia = 35 / 25.4;      // 35mm cup = 1.378"
    const pilotDia = 5 / 25.4;     // 5mm pilot = 0.197"
    const pilotOffset = 1.024;     // Distance from cup center to pilot holes
    const edgeSetback = 22 / 25.4; // 22mm from hinge side edge = 0.866"
    
    const bottomY = 3;             // 3" from bottom
    const topY = part.height - 3;  // 3" from top
    
    // Bottom hinge - cup and pilots
    holes.push({ x: edgeSetback, y: bottomY, diameter: cupDia, color: '#dc2626', label: '35mm Cup' });
    holes.push({ x: edgeSetback, y: bottomY - pilotOffset, diameter: pilotDia, color: '#16a34a', label: '5mm Pilot' });
    holes.push({ x: edgeSetback, y: bottomY + pilotOffset, diameter: pilotDia, color: '#16a34a', label: '5mm Pilot' });
    
    // Top hinge - cup and pilots
    holes.push({ x: edgeSetback, y: topY, diameter: cupDia, color: '#dc2626', label: '35mm Cup' });
    holes.push({ x: edgeSetback, y: topY - pilotOffset, diameter: pilotDia, color: '#16a34a', label: '5mm Pilot' });
    holes.push({ x: edgeSetback, y: topY + pilotOffset, diameter: pilotDia, color: '#16a34a', label: '5mm Pilot' });
    
    return holes;
}

// Get drawer attachment hole positions
function getDrawerHoles(part) {
    const holes = [];
    const holeDia = 5 / 25.4;  // 5mm
    const inset = 1.5;         // 1.5" from edges
    
    // 4-corner pattern
    holes.push({ x: inset, y: inset, diameter: holeDia, color: '#d97706', label: 'Attachment' });
    holes.push({ x: part.width - inset, y: inset, diameter: holeDia, color: '#d97706', label: 'Attachment' });
    holes.push({ x: inset, y: part.height - inset, diameter: holeDia, color: '#d97706', label: 'Attachment' });
    holes.push({ x: part.width - inset, y: part.height - inset, diameter: holeDia, color: '#d97706', label: 'Attachment' });
    
    return holes;
}

// Zoom controls
function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 3); updatePreview(); }
function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.5); updatePreview(); }
function resetZoom() { zoomLevel = 1; updatePreview(); }

// Fraction formatting
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

// DXF Export
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
        
        const layers = ['Outline', 'Door_Hinge_35mm_12mm', 'Door_Hinge_5mm_10mm', 'Drawer_Lock_5mm'];
        layers.forEach(name => {
            dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
        });
        dxf += '0\nENDTAB\n0\nENDSEC\n';
        
        dxf += '0\nSECTION\n2\nENTITIES\n';
        
        // Outline
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n`;
        dxf += `10\n0\n20\n0\n10\n${part.width}\n20\n0\n`;
        dxf += `10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        // Holes
        const holes = part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part);
        holes.forEach(hole => {
            let layer;
            if (hole.diameter > 0.5) {
                layer = 'Door_Hinge_35mm_12mm';
            } else if (part.type === 'door') {
                layer = 'Door_Hinge_5mm_10mm';
            } else {
                layer = 'Drawer_Lock_5mm';
            }
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
