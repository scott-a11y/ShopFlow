import { useState } from 'react';
import { parseCSV } from '../io';
import { useStore } from '../store';

export function ImportModal({ onClose }: { onClose: () => void }) {
    const [text, setText] = useState('');
    const { parts, setParts } = useStore();

    const handleImport = () => {
        const newParts = parseCSV(text);
        if (newParts.length) {
            setParts([...parts, ...newParts]);
        }
        onClose();
    };

    return (
        <div className="modal" style={{ display: 'flex' }}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Import Parts</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Example: Door 1, 15, 30, door, left, Kitchen, C1"
                    />
                </div>
                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleImport}>Import</button>
                </div>
            </div>
        </div>
    );
}
