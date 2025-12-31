import { Part, HingeHole } from './types';
import { formatDim, parseDim } from './utils';


export interface DrawState {
    parts: Part[];
    zoomLevel: number;
    panOffset: { x: number, y: number };
    showDimensions: boolean;
}

export function drawPreview(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, selectedPartId: string, hingeSettings: any, state: DrawState) {
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    if (W <= 0 || H <= 0) return;

    // Clear
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, H);

    const part = state.parts.find(p => p.id === parseInt(selectedPartId));
    if (!part) {
        ctx.fillStyle = '#64748b';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Add parts to see preview', W / 2, H / 2);
        return;
    }

    // Calculate scale and position
    const pad = 80;
    const scale = Math.min((W - pad * 2) / part.width, (H - pad * 2) / part.height) * state.zoomLevel;
    const pw = part.width * scale;
    const ph = part.height * scale;
    const ox = (W - pw) / 2 + state.panOffset.x;
    const oy = (H - ph) / 2 + state.panOffset.y;

    // Export transform for mouse interactions
    const transform = { scale, ox, oy, pw, ph };

    // Draw part (wood color)
    ctx.fillStyle = '#c4956a';
    ctx.fillRect(ox, oy, pw, ph);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, pw, ph);

    // Get hinge holes
    const hingeSide = part.hingeSide || hingeSettings.side;
    const hingeCount = parseInt(hingeSettings.count) || 2;
    const holes = part.type === 'door' ? getHingeHoles(part, hingeSide, hingeCount, hingeSettings) : [];

    // Draw holes
    holes.forEach(h => {
        const hx = ox + h.x * scale;
        const hy = oy + (part.height - h.y) * scale;
        const r = Math.max(h.dia / 2 * scale, 3);

        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = h.isCup ? '#dc2626' : '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Dimensions
    if (state.showDimensions) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatDim(part.width), ox + pw / 2, oy - 15);

        ctx.save();
        ctx.translate(ox - 20, oy + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatDim(part.height), 0, 0);
        ctx.restore();

        // LARGE door name
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(part.name, ox + pw / 2, oy + ph / 2 - 10);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(formatDim(part.width) + ' x ' + formatDim(part.height), ox + pw / 2, oy + ph / 2 + 10);

        // Labels
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fbbf24';
        if (hingeSide === 'left' || hingeSide === 'both') {
            ctx.textAlign = 'left';
            ctx.fillText('◀ HINGE', ox + 5, oy + ph / 2);
        }
        if (hingeSide === 'right' || hingeSide === 'both') {
            ctx.textAlign = 'right';
            ctx.fillText('HINGE ▶', ox + pw - 5, oy + ph / 2);
        }
        if (hingeSide === 'top') {
            ctx.textAlign = 'center';
            ctx.fillText('▲ HINGE', ox + pw / 2, oy + 15);
        }
        if (hingeSide === 'bottom') {
            ctx.textAlign = 'center';
            ctx.fillText('HINGE ▼', ox + pw / 2, oy + ph - 8);
        }
    }

    return transform;
}

export function getHingeHoles(part: Part, hingeSide: string, hingeCount: number, settings: any): HingeHole[] {
    const holes: HingeHole[] = [];
    const cupD = 35 / 25.4;
    const pilotD = 8 / 25.4;
    const pilotOffset = 22.5 / 25.4;

    const bottomInset = parseDim(settings.bottomInset) || 3;
    const topInset = parseDim(settings.topInset) || 3;

    const isHorizontal = (hingeSide === 'top' || hingeSide === 'bottom');

    if (isHorizontal) {
        const cupY = 22.5 / 25.4;
        const pilotY = 32 / 25.4;

        const leftX = bottomInset;
        const rightX = part.width - topInset;
        let xPos = [leftX, rightX];

        if (hingeCount >= 3) xPos.push((leftX + rightX) / 2);
        if (hingeCount >= 4) {
            const span = rightX - leftX;
            xPos = [leftX, leftX + span / 3, leftX + span * 2 / 3, rightX];
        }

        const cupYPos = hingeSide === 'top' ? part.height - cupY : cupY;
        const pilotYPos = hingeSide === 'top' ? part.height - pilotY : pilotY;

        xPos.forEach((x: number) => {
            holes.push({ x: x, y: cupYPos, dia: cupD, isCup: true });
            holes.push({ x: x - pilotOffset, y: pilotYPos, dia: pilotD, isCup: false });
            holes.push({ x: x + pilotOffset, y: pilotYPos, dia: pilotD, isCup: false });
        });
    } else {
        const cupX = 22.5 / 25.4;
        const pilotX = 32 / 25.4;

        const bottomY = bottomInset;
        const topY = part.height - topInset;
        let yPos = [bottomY, topY];

        if (hingeCount >= 3) yPos.push((bottomY + topY) / 2);
        if (hingeCount >= 4) {
            const span = topY - bottomY;
            yPos = [bottomY, bottomY + span / 3, bottomY + span * 2 / 3, topY];
        }

        const sides = hingeSide === 'both' ? ['left', 'right'] : [hingeSide];

        sides.forEach(side => {
            yPos.forEach((y: number) => {
                const cx = side === 'right' ? part.width - cupX : cupX;
                const px = side === 'right' ? part.width - pilotX : pilotX;

                holes.push({ x: cx, y: y, dia: cupD, isCup: true });
                holes.push({ x: px, y: y - pilotOffset, dia: pilotD, isCup: false });
                holes.push({ x: px, y: y + pilotOffset, dia: pilotD, isCup: false });
            });
        });
    }
    return holes;
}
