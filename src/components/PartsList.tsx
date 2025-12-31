import { useStore } from '../store';
import { formatDim, parseDim } from '../utils';
import { Part } from '../types';

export function PartsList() {
    const { parts, updatePart, removePart, togglePartSelection, addPart } = useStore();

    const handleAdd = (room = '', cabinet = '') => {
        const id = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
        addPart({
            id, name: 'Door ' + id, width: 15, height: 30, type: 'door',
            hingeSide: 'left', room, cabinet, selected: true
        });
    };

    // Grouping logic
    const groups: { [room: string]: { [cabinet: string]: Part[] } } = {};
    const unassigned: Part[] = [];

    parts.forEach(p => {
        if (!p.room && !p.cabinet) {
            unassigned.push(p);
            return;
        }
        const r = p.room || 'Unassigned Room';
        const c = p.cabinet || 'Unassigned Cabinet';
        if (!groups[r]) groups[r] = {};
        if (!groups[r][c]) groups[r][c] = [];
        groups[r][c].push(p);
    });

    const renderTable = (list: Part[], contextRoom: string, contextCabinet: string) => (
        <table className="parts-table" style={{ marginBottom: 20 }}>
            <thead>
                <tr>
                    <th style={{ width: 22 }}></th>
                    <th className="col-name">Name</th>
                    <th style={{ width: 55 }}>W</th>
                    <th style={{ width: 55 }}>H</th>
                    <th style={{ width: 55 }}>Type</th>
                    <th style={{ width: 40 }}>Side</th>
                    <th style={{ width: 60 }}>Rm/Cab</th>
                    <th style={{ width: 22 }}></th>
                </tr>
            </thead>
            <tbody>
                {list.map(p => (
                    <tr key={p.id}>
                        <td>
                            <input
                                type="checkbox"
                                checked={p.selected}
                                onChange={() => togglePartSelection(p.id)}
                            />
                        </td>
                        <td>
                            <input
                                className="part-name-input"
                                value={p.name}
                                onChange={e => updatePart(p.id, { name: e.target.value })}
                            />
                        </td>
                        <td>
                            <input
                                value={formatDim(p.width)}
                                onChange={e => updatePart(p.id, { width: parseDim(e.target.value) })}
                                onBlur={e => e.target.value = formatDim(p.width)}
                            />
                        </td>
                        <td>
                            <input
                                value={formatDim(p.height)}
                                onChange={e => updatePart(p.id, { height: parseDim(e.target.value) })}
                                onBlur={e => e.target.value = formatDim(p.height)}
                            />
                        </td>
                        <td>
                            <select
                                value={p.type}
                                onChange={e => updatePart(p.id, { type: e.target.value as any })}
                            >
                                <option value="door">door</option>
                                <option value="drawer">drawer</option>
                            </select>
                        </td>
                        <td>
                            <select
                                value={p.hingeSide}
                                onChange={e => updatePart(p.id, { hingeSide: e.target.value as any })}
                            >
                                <option value="left">L</option>
                                <option value="right">R</option>
                                <option value="top">T</option>
                                <option value="bottom">B</option>
                            </select>
                        </td>
                        <td>
                            {/* Quick Edit for Room/Cab */}
                            <div style={{ display: 'flex', gap: 2 }}>
                                <input
                                    style={{ width: 25, padding: 0 }}
                                    title="Room"
                                    value={p.room || ''}
                                    onChange={e => updatePart(p.id, { room: e.target.value })}
                                />
                                <input
                                    style={{ width: 25, padding: 0 }}
                                    title="Cabinet"
                                    value={p.cabinet || ''}
                                    onChange={e => updatePart(p.id, { cabinet: e.target.value })}
                                />
                            </div>
                        </td>
                        <td>
                            <button className="btn-delete" onClick={() => removePart(p.id)}>×</button>
                        </td>
                    </tr>
                ))}
                <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 5 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleAdd(contextRoom === 'Unassigned Room' ? '' : contextRoom, contextCabinet === 'Unassigned Cabinet' ? '' : contextCabinet)}>+ Add to {contextCabinet || 'List'}</button>
                    </td>
                </tr>
            </tbody>
        </table>
    );

    return (
        <div className="right-panel">
            <div className="card parts-card">
                <div className="card-header">
                    <span>Parts List</span>
                    <div className="parts-header-controls">
                        <button className="btn btn-primary btn-sm" onClick={() => handleAdd()}>+ Add New</button>
                    </div>
                </div>
                <div className="card-body" style={{ padding: 10, overflowY: 'auto' }}>
                    {Object.keys(groups).sort().map(room => (
                        <div key={room} className="group-room">
                            <h4 style={{ margin: '10px 0 5px 0', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 1 }}>{room}</h4>
                            {Object.keys(groups[room]).sort().map(cabinet => (
                                <div key={cabinet} className="group-cabinet" style={{ paddingLeft: 10 }}>
                                    <h5 style={{ margin: '5px 0', color: '#e2e8f0' }}>{cabinet}</h5>
                                    {renderTable(groups[room][cabinet], room, cabinet)}
                                </div>
                            ))}
                        </div>
                    ))}

                    {unassigned.length > 0 && (
                        <div className="group-unassigned">
                            <h4 style={{ margin: '10px 0 5px 0', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 1 }}>Unassigned</h4>
                            {renderTable(unassigned, '', '')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
