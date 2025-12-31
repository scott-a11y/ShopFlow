import { Part, PlacedPart, Sheet } from './types';

// Standard 4x8 sheet in inches
const SHEET_WIDTH = 48; // actually 49 sometimes, but stick to 4x8 nominal? or 49x97?
const SHEET_HEIGHT = 96;
const SPACING = 0.5; // distance between parts
const MARGIN = 0.5; // Sheet margin

export function nestParts(parts: Part[]): Sheet[] {
    // 1. Prepare items for potpack
    // Potpack works with {w, h}. We need to add padding for spacing.
    // We treat each part as a separate box.
    // NOTE: Potpack is a single-bin packer (infinite size). 
    // Since we have multiple sheets, this is a "Bin Packing" problem, not just packing.
    // Potpack tries to make a square mostly.
    // Strategy: 
    // A simple Multi-Bin strategies:
    // Sort parts by Area descending.
    // Try to fit into current sheet. If not, start new sheet.
    // Since potpack packs everything into ONE box, it's not directly multi-sheet.
    // WE need a custom placement or use potpack per sheet? 
    // Actually, potpack expands the container. 
    // Better simpler algo for Sheet goods: "Shelf" or "Guillotine" or "MaxRects".
    // given we want to keep it simple and depend on potpack:
    // We can try to pack ALL parts. If valid width <= 48, great. Height will be tall.
    // Then cut the tall strip into 96" sheets.
    // BUT parts might straddle the cut line.

    // Better Approach for CNC (Shelf/Row packing):
    // Sort by height. Fill rows.

    // Let's implement a simple "First Fit Decreasing" shelf algo for now, 
    // attempting to fill 48x96 sheets.

    const sheets: Sheet[] = [];
    let currentSheetParts: PlacedPart[] = [];
    // clone and sort
    const queue = [...parts].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));

    // Naive implementation: one part per sheet for testing flow? No, that's too simple.
    // Simple Shelf Algo:
    // x, y cursor.
    // If fits in row, add. 
    // If not, new row (y += maxRowHeight).
    // If y > SHEET_HEIGHT, new Sheet.

    let sheetId = 1;

    // Optimization: Rotate parts to align with grain or fit better?
    // Assuming wood grain matters: 
    // "grain" direction is usually length (height).
    // so we keep H as H? 
    // For now, assume no rotation logic unless requested.

    startNewSheet();

    // Very naive layout engine for MVP
    let cx = MARGIN;
    let cy = MARGIN;
    let rowH = 0;

    queue.forEach(p => {
        // Check if part fits in remaining row width
        if (cx + p.width + MARGIN > SHEET_WIDTH) {
            // New row
            cx = MARGIN;
            cy += rowH + SPACING;
            rowH = 0;
        }

        // Check if row fits in sheet height
        if (cy + p.height + MARGIN > SHEET_HEIGHT) {
            // Push old sheet
            finishSheet();
            startNewSheet();
            cx = MARGIN;
            cy = MARGIN;
            rowH = 0;
        }

        // Place part
        currentSheetParts.push({
            ...p,
            x: cx,
            y: cy,
            rotation: 0,
            sheetId: sheetId
        });

        // Advance cursor
        cx += p.width + SPACING;
        rowH = Math.max(rowH, p.height);
    });

    finishSheet();

    function startNewSheet() {
        currentSheetParts = [];
    }

    function finishSheet() {
        if (currentSheetParts.length === 0) return;
        sheets.push({
            id: sheetId++,
            width: SHEET_WIDTH,
            height: SHEET_HEIGHT,
            parts: currentSheetParts,
            waste: 0 // TODO calc waste
        });
    }

    return sheets;
}
