import { useStore } from '../store';

export function StatsBar() {
    const parts = useStore(s => s.parts);
    const sheetSize = 32; // TODO: make dynamic in store settings

    const doors = parts.filter(p => p.type === 'door').length;
    const drawers = parts.filter(p => p.type === 'drawer').length;
    const sqft = parts.reduce((s, p) => s + (p.width * p.height) / 144, 0);
    const sheets = Math.ceil(sqft * 1.15 / sheetSize);

    return (
        <div className="stats-row">
            <Stat label="Total Parts" value={parts.length} />
            <Stat label="Doors" value={doors} />
            <Stat label="Drawer Fronts" value={drawers} />
            <Stat label="Sq Ft" value={sqft.toFixed(1)} />
            <Stat label="Sheets" value={sheets} />
        </div>
    );
}

function Stat({ label, value }: { label: string, value: string | number }) {
    return (
        <div className="stat">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}
