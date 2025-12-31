import { create } from 'zustand';
import { Part, Database } from './types';

interface AppState {
    parts: Part[];
    zoomLevel: number;
    showDimensions: boolean;
    measureMode: boolean;
    displayUnits: 'fraction' | 'decimal' | 'metric';
    panOffset: { x: number; y: number };
    db: Database['tables'];
    dbInfo: string;

    // Actions
    setParts: (parts: Part[]) => void;
    addPart: (part: Part) => void;
    updatePart: (id: number, updates: Partial<Part>) => void;
    removePart: (id: number) => void;
    togglePartSelection: (id: number) => void;
    setZoom: (zoom: number) => void;
    setPan: (x: number, y: number) => void;
    toggleDimensions: () => void;
    setDB: (db: Database['tables']) => void;
    setDisplayUnits: (units: 'fraction' | 'decimal' | 'metric') => void;
}

export const useStore = create<AppState>((set) => ({
    parts: [],
    zoomLevel: 1,
    showDimensions: true,
    measureMode: false,
    displayUnits: 'fraction',
    panOffset: { x: 0, y: 0 },
    db: {},
    dbInfo: 'Loading...',

    setParts: (parts) => set({ parts }),
    addPart: (part) => set((state) => ({ parts: [...state.parts, part] })),
    updatePart: (id, updates) => set((state) => ({
        parts: state.parts.map(p => p.id === id ? { ...p, ...updates } : p)
    })),
    removePart: (id) => set((state) => ({ parts: state.parts.filter(p => p.id !== id) })),
    togglePartSelection: (id) => set((state) => ({
        parts: state.parts.map(p => p.id === id ? { ...p, selected: !p.selected } : p)
    })),
    setZoom: (zoomLevel) => set({ zoomLevel }),
    setPan: (x, y) => set({ panOffset: { x, y } }),
    toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),
    setDB: (db) => set({
        db,
        dbInfo: (db.Hole?.length || 0) + ' holes | ' + (db.Part?.length || 0) + ' parts'
    }),
    setDisplayUnits: (displayUnits) => set({ displayUnits })
}));
