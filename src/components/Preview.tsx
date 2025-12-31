import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { drawPreview } from '../drawing';

export function Preview() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        parts, zoomLevel, showDimensions, panOffset, setPan, setZoom
    } = useStore();

    // Derived state for drawing
    const selectedPart = parts.find(p => p.selected);
    const selectedId = selectedPart ? String(selectedPart.id) : '';

    // We need to pass hinge settings to drawPreview, but they are in DOM currently in the vanilla version.
    // In React version, we should probably pull them from store.
    // SHORTCUT: For now, I'll pass a mock or read from store if I move settings to store.
    // I moved settings to store in `store.ts` (implied? No, I only added `displayUnits`).
    // I need to add hinge settings to store or read them from Sidebar state.
    // To make it clean, let's assume `Sidebar` updates global store for hinge settings.
    // Checking `store.ts`... I missed hinge settings! 
    // I will read them from a temporary object or default for now to get it rendering, 
    // then I'll refactor Store to include Hinge State in the next step.

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Mock settings for now until Store is updated
            const settings = {
                side: selectedPart?.hingeSide || 'left',
                count: 2, // Default
                bottomInset: 3,
                topInset: 3
            };

            drawPreview(canvas, ctx, selectedId, settings as any, { parts, zoomLevel, showDimensions, panOffset });
        };

        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [parts, zoomLevel, showDimensions, panOffset, selectedId]);

    // Pan/Zoom handlers
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const newZoom = Math.max(0.25, Math.min(5, zoomLevel * (e.deltaY > 0 ? 0.9 : 1.1)));
        setZoom(newZoom);
    };

    return (
        <div className="center-panel">
            <div className="card preview-card">
                <div className="card-header">
                    <span>Preview</span>
                    <select value={selectedId} onChange={() => {/* Selection logic pending */ }}>
                        {parts.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                <div className="card-body">
                    <div className="preview-container" ref={containerRef}>
                        <canvas
                            ref={canvasRef}
                            onWheel={handleWheel}
                            style={{ cursor: 'grab' }}
                        />
                    </div>
                    <div className="preview-controls">
                        <button className="btn" onClick={() => setZoom(zoomLevel * 1.25)}>🔍+</button>
                        <button className="btn" onClick={() => setZoom(zoomLevel / 1.25)}>🔍-</button>
                        <button className="btn" onClick={() => { setZoom(1); setPan(0, 0); }}>↺</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
