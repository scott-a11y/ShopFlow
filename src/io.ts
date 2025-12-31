import { Part } from './types';
import { getHingeHoles } from './drawing';
import { parseDim } from './utils';

// Actually UI should import IO usually. But IO imports UI to trigger renders?
// Better: IO functions return data or update state, and UI observes state?
// For now, let's keep it simple: IO updates state and calls render.
// To avoid circular refs, maybe pass render callback or use event bus?
// Let's rely on 'main' binding or pass callbacks. 
// For this step, I will stick to logic and let UI handle the calling.

// Vector text removed (unused)


export const exportAllDXF = exportDXF;

export function exportDXF(list: Part[], jobName: string, hingeCount: number) {
    // CabinetSense layer names from database
    const CS_LAYERS = {
        fastCut: 'Fast Cut',
        slowCut: 'Slow Cut',
        microCut: 'Micro Cut',
        mediumCut: 'Medium Cut',
        label: 'Label'
    };

    list.forEach(part => {
        const hingeSide = part.hingeSide || 'left';
        // Need to pass a mock settings object or get actual from DOM/State? 
        // For now, let's assume default unless passed.
        // ideally IO shouldn't read DOM.
        // We'll pass minimal settings or use defaults.
        const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount, { bottomInset: 3, topInset: 3 }) : [];
        const thickness = 0.75;

        // Profile layer directly from dropdown (now uses CabinetSense names)
        const profileLayer = part.profileTool || CS_LAYERS.fastCut;

        // DXF Header (CabinetSense format)
        let dxf = ' 999\r\n Created with ShopFlow (CabinetSense compatible)\r\n';
        dxf += ' 0\r\nSECTION\r\n 2\r\nHEADER\r\n';
        dxf += ' 9\r\n$ACADVER\r\n 1\r\nAC1009\r\n';
        dxf += ' 9\r\n$INSBASE\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n';
        dxf += ' 9\r\n$EXTMIN\r\n 10\r\n0\r\n 20\r\n0\r\n 30\r\n ' + thickness + '\r\n';
        dxf += ' 9\r\n$EXTMAX\r\n 10\r\n1000\r\n 20\r\n1000\r\n 30\r\n1000\r\n';
        dxf += '0\r\nENDSEC\r\n';

        // Entities section
        dxf += ' 0\r\nSECTION\r\n 2\r\nENTITIES\r\n';

        // Profile outline as POLYLINE (CabinetSense style)
        dxf += '  0\r\nPOLYLINE\r\n  8\r\n' + profileLayer + '\r\n';
        dxf += '  66\r\n1\r\n  39\r\n' + thickness + '\r\n  30\r\n-0.0\r\n  70\r\n1\r\n';
        const verts = [[part.width, part.height], [0, part.height], [0, 0], [part.width, 0], [part.width, part.height]];
        verts.forEach(v => {
            dxf += '  0\r\nVERTEX\r\n  8\r\n' + profileLayer + '\r\n';
            dxf += '  10\r\n' + v[0].toFixed(9) + '\r\n  20\r\n' + v[1].toFixed(9) + '\r\n  30\r\n0\r\n';
        });
        dxf += '  0\r\nSEQEND\r\n';

        // Holes as CIRCLES
        holes.forEach(h => {
            const depthMM = Math.round((h.depth || 0.5) * 25.4 * 10) / 10;
            const zPos = thickness - (h.depth || 0.5);
            let layer;
            if (h.isCup) {
                layer = 'Pocket..d(1.375).#' + depthMM + 'mm';
            } else {
                const toolDia = h.dia < 0.25 ? '0.125' : h.dia < 0.35 ? '0.25' : '0.375';
                layer = 'Drilling..d(' + toolDia + ').#' + depthMM + 'mm';
            }
            dxf += '0\r\nCIRCLE\r\n8\r\n' + layer + '\r\n';
            dxf += '39\r\n' + (h.depth || 0.5).toFixed(9) + '\r\n';
            dxf += '10\r\n' + h.x.toFixed(9) + '\r\n';
            dxf += '       20\r\n' + h.y.toFixed(9) + '\r\n';
            dxf += '       30\r\n' + zPos.toFixed(9) + '\r\n';
            dxf += '       40\r\n' + (h.dia / 2).toFixed(8) + '\r\n';
        });

        // Labels as TEXT
        const cx = part.width / 2, cy = part.height / 2;
        dxf += '0\r\nTEXT\r\n8\r\n' + CS_LAYERS.label + '\r\n';
        dxf += '10\r\n' + cx.toFixed(6) + '\r\n20\r\n' + cy.toFixed(6) + '\r\n30\r\n0\r\n';
        dxf += '40\r\n0.5\r\n50\r\n0\r\n1\r\n' + part.name + ' \r\n';

        // Edge labels
        dxf += '0\r\nTEXT\r\n8\r\n' + CS_LAYERS.label + '\r\n10\r\n' + cx.toFixed(6) + '\r\n20\r\n1.016\r\n30\r\n0\r\n40\r\n0.5\r\n50\r\n180\r\n1\r\n-        \r\n';
        dxf += '0\r\nTEXT\r\n8\r\n' + CS_LAYERS.label + '\r\n10\r\n' + cx.toFixed(6) + '\r\n20\r\n' + (part.height - 1.016).toFixed(6) + '\r\n30\r\n0\r\n40\r\n0.5\r\n50\r\n0\r\n1\r\n-        \r\n';
        dxf += '0\r\nTEXT\r\n8\r\n' + CS_LAYERS.label + '\r\n10\r\n1.016\r\n20\r\n' + cy.toFixed(6) + '\r\n30\r\n0\r\n40\r\n0.5\r\n50\r\n90\r\n1\r\n-        \r\n';
        dxf += '0\r\nTEXT\r\n8\r\n' + CS_LAYERS.label + '\r\n10\r\n' + (part.width - 1.016).toFixed(6) + '\r\n20\r\n' + cy.toFixed(6) + '\r\n30\r\n0\r\n40\r\n0.5\r\n50\r\n270\r\n1\r\n-        \r\n';

        dxf += '  0\r\nENDSEC\r\n  0\r\nEOF\r\n';

        // Filename
        const fn = 'pt-' + part.id + '-' + jobName + '-' + part.name.replace(/[^a-zA-Z0-9]/g, '') + '.dxf';

        // Trigger download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
        a.download = fn;
        a.click();
    });
}

// Simple export wrapper for integration
export function saveJobToJSON(data: any) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data.jobNumber || 'job') + '_' + (data.customer || 'customer') + '.json';
    a.click();
}

export function parseCSV(text: string): Part[] {
    const parts: Part[] = [];
    if (!text) return parts;

    // Simple parser extracted from app.js
    const lines = text.split('\n').filter(l => l.trim());
    let nextId = Date.now(); // Simple generic ID generator for import

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
                    hingeSide: (cols[4] || 'left').toLowerCase() as any,
                    room: (cols[5] || '').trim(),
                    cabinet: (cols[6] || '').trim(),
                    selected: true
                });
            }
        }
    });

    return parts;
}

// Load helper
export function loadJobFromJSON(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target?.result as string);
                resolve(data);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}

