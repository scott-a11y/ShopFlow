// CabinetSense Configurator v5 - Main Application
let DB = null;
let parts = [];
let zoomLevel = 1;

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
    // Door hinges (Class 28 = Door Hinge, Class 15 = Door Hinge Clip)
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
    
    // Drawer slides
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
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        };
    });
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

// Update preview SVG
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
    const padding = 60;
    
    const scaleX = (svgWidth - padding * 2) / part.width;
    const scaleY = (svgHeight - padding * 2) / part.height;
    const scale = Math.min(scaleX, scaleY) * zoomLevel;
    
    const partW = part.width * scale;
    const partH = part.height * scale;
    const offsetX = (svgWidth - partW) / 2;
    const offsetY = (svgHeight - partH) / 2;
    
    let html = `
        <rect x="${offsetX}" y="${offsetY}" width="${partW}" height="${partH}" 
              fill="#f1f5f9" stroke="#3b82f6" stroke-width="2"/>
    `;
    
    // Add holes based on part type
    const holes = part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part);
    holes.forEach(hole => {
        const hx = offsetX + hole.x * scale;
        const hy = offsetY + (part.height - hole.y) * scale;
        const radius = Math.max(hole.diameter / 2 * scale, 3);
        html += `<circle cx="${hx}" cy="${hy}" r="${radius}" fill="${hole.color}" stroke="#000" stroke-width="1"/>`;
    });
    
    // Dimensions
    html += `
        <text x="${offsetX + partW/2}" y="${offsetY - 15}" fill="#fff" text-anchor="middle" font-size="14">${formatFraction(part.width)}</text>
        <text x="${offsetX - 15}" y="${offsetY + partH/2}" fill="#fff" text-anchor="middle" font-size="14" 
              transform="rotate(-90, ${offsetX - 15}, ${offsetY + partH/2})">${formatFraction(part.height)}</text>
    `;
    
    svg.innerHTML = html;
}

// Get hinge hole positions for a door
function getHingeHoles(part) {
    const holes = [];
    const cupDia = 35 / 25.4;      // 35mm cup
    const pilotDia = 5 / 25.4;     // 5mm pilot
    const pilotOffset = 1.024;     // From cup center
    const edgeSetback = 22 / 25.4; // 22mm from edge
    
    const bottomY = 3;             // 3" from bottom
    const topY = part.height - 3;  // 3" from top
    
    // Bottom hinge
    holes.push({ x: edgeSetback, y: bottomY, diameter: cupDia, color: '#dc2626' });
    holes.push({ x: edgeSetback, y: bottomY - pilotOffset, diameter: pilotDia, color: '#16a34a' });
    holes.push({ x: edgeSetback, y: bottomY + pilotOffset, diameter: pilotDia, color: '#16a34a' });
    
    // Top hinge  
    holes.push({ x: edgeSetback, y: topY, diameter: cupDia, color: '#dc2626' });
    holes.push({ x: edgeSetback, y: topY - pilotOffset, diameter: pilotDia, color: '#16a34a' });
    holes.push({ x: edgeSetback, y: topY + pilotOffset, diameter: pilotDia, color: '#16a34a' });
    
    return holes;
}

// Get drawer attachment hole positions
function getDrawerHoles(part) {
    const holes = [];
    const holeDia = 5 / 25.4;
    const inset = 1.5;
    
    // 4-corner pattern
    holes.push({ x: inset, y: inset, diameter: holeDia, color: '#d97706' });
    holes.push({ x: part.width - inset, y: inset, diameter: holeDia, color: '#d97706' });
    holes.push({ x: inset, y: part.height - inset, diameter: holeDia, color: '#d97706' });
    holes.push({ x: part.width - inset, y: part.height - inset, diameter: holeDia, color: '#d97706' });
    
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
        
        // Layers
        const layers = ['Outline', 'Door_Hinge_35mm', 'Door_Hinge_5mm', 'Drawer_Lock'];
        layers.forEach(name => {
            dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
        });
        dxf += '0\nENDTAB\n0\nENDSEC\n';
        
        // Entities
        dxf += '0\nSECTION\n2\nENTITIES\n';
        
        // Outline
        dxf += `0\nLWPOLYLINE\n8\nOutline\n90\n4\n70\n1\n`;
        dxf += `10\n0\n20\n0\n10\n${part.width}\n20\n0\n`;
        dxf += `10\n${part.width}\n20\n${part.height}\n10\n0\n20\n${part.height}\n`;
        
        // Holes
        const holes = part.type === 'door' ? getHingeHoles(part) : getDrawerHoles(part);
        holes.forEach(hole => {
            const layer = hole.diameter > 0.5 ? 'Door_Hinge_35mm' : 
                         part.type === 'door' ? 'Door_Hinge_5mm' : 'Drawer_Lock';
            dxf += `0\nCIRCLE\n8\n${layer}\n10\n${hole.x}\n20\n${hole.y}\n40\n${hole.diameter/2}\n`;
        });
        
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        // Download
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${part.name.replace(/\s+/g, '_')}.dxf`;
        a.click();
        URL.revokeObjectURL(url);
    });
}
