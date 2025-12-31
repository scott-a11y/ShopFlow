import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { nestParts } from '../nesting';
import { generateGCode } from '../gcode';
import { Sheet } from '../types';

export function NestingView() {
    const parts = useStore(s => s.parts);
    const [sheets, setSheets] = useState<Sheet[]>([]);

    // Auto-nest on mount or when parts change? Manual for now.
    const handleNest = () => {
        const result = nestParts(parts);
        setSheets(result);
    };

    const handleDownload = (sheet: Sheet) => {
        const code = generateGCode(sheet);
        const blob = new Blob([code], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sheet-${sheet.id}.nc`;
        a.click();
    };

    return (
        <div className="nesting-view" style={{ padding: 20, overflow: 'auto', height: '100%' }}>
            <div className="nesting-controls" style={{ marginBottom: 20 }}>
                <h2>Nesting & CAM</h2>
                <p>Parts: {parts.length} | Sheets: {sheets.length}</p>
                <button className="btn btn-primary" onClick={handleNest}>Run Nesting</button>
            </div>

            <div className="sheets-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {sheets.map(sheet => (
                    <div key={sheet.id} className="sheet-preview" style={{ background: '#334155', padding: 10, borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span style={{ color: 'white' }}>Sheet {sheet.id}</span>
                            <button className="btn btn-sm" onClick={() => handleDownload(sheet)}>Download G-Code</button>
                        </div>
                        <SheetCanvas sheet={sheet} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function SheetCanvas({ sheet }: { sheet: Sheet }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Render simple preview
        const scale = 3; // Pixels per inch
        canvas.width = sheet.width * scale;
        canvas.height = sheet.height * scale;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        sheet.parts.forEach(p => {
            const x = p.x * scale;
            const y = (sheet.height - p.y - p.height) * scale; // Flip Y for canvas
            const w = p.width * scale;
            const h = p.height * scale;

            ctx.fillStyle = '#c4956a';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(x, y, w, h);
        });

    }, [sheet]);

    return <canvas ref={canvasRef} style={{ border: '1px solid #64748b' }} />;
}
