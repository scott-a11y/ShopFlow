export interface Dimensions {
    width: number;
    height: number;
}

export interface Part extends Dimensions {
    id: number;
    name: string;
    type: 'door' | 'drawer';
    hingeSide: 'left' | 'right' | 'both' | 'top' | 'bottom';
    room: string;
    cabinet: string;
    selected: boolean;
    profileTool?: string;
    // Nesting props
    quantity?: number; // For future bulk add
    // Runtime properties
    holeCount?: number;
}

export interface PlacedPart extends Part {
    x: number;
    y: number;
    rotation: number; // 0 or 90
    sheetId: number;
}

export interface Sheet {
    id: number;
    width: number;
    height: number;
    parts: PlacedPart[];
    waste: number;
}

export interface HingeHole {
    x: number;
    y: number;
    dia: number;
    depth?: number;
    isCup: boolean;
}

export interface Database {
    tables: {
        Hole?: any[];
        Part?: any[];
        Hinging?: any[];
        [key: string]: any;
    };
}

export interface AppState {
    parts: Part[];
    zoomLevel: number;
    showDimensions: boolean;
    measureMode: boolean;
    displayUnits: 'fraction' | 'decimal' | 'metric';
    panOffset: { x: number; y: number };
}
