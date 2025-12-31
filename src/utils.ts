import { useStore } from './store';

export function formatDim(inches: number): string {
    if (!inches || isNaN(inches)) return '0';
    const displayUnits = useStore.getState().displayUnits;
    if (displayUnits === 'metric') return (inches * 25.4).toFixed(1) + 'mm';
    if (displayUnits === 'decimal') return inches.toFixed(2) + '"';

    // Fractions
    const whole = Math.floor(inches);
    const frac = inches - whole;
    if (frac < 0.03) return whole + '"';

    const fracs: [number, string][] = [[1 / 16, '1/16'], [1 / 8, '1/8'], [3 / 16, '3/16'], [1 / 4, '1/4'], [5 / 16, '5/16'], [3 / 8, '3/8'], [7 / 16, '7/16'], [1 / 2, '1/2'], [9 / 16, '9/16'], [5 / 8, '5/8'], [11 / 16, '11/16'], [3 / 4, '3/4'], [13 / 16, '13/16'], [7 / 8, '7/8'], [15 / 16, '15/16']];
    let best = fracs[0];
    for (const f of fracs) {
        if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
    }
    return whole ? whole + '-' + best[1] + '"' : best[1] + '"';
}

export function parseDim(s: string | number): number {
    if (!s) return 0;
    const str = String(s).trim().replace(/"/g, '');
    if (str.toLowerCase().includes('mm')) return parseFloat(str) / 25.4;
    if (str.includes('-') && str.includes('/')) {
        const parts = str.split('-');
        const frac = parts[1].split('/');
        return parseInt(parts[0]) + parseFloat(frac[0]) / parseFloat(frac[1]);
    }
    if (str.includes('/')) {
        const frac = str.split('/');
        return parseFloat(frac[0]) / parseFloat(frac[1]);
    }
    return parseFloat(str) || 0;
}
