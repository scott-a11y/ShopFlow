import { useState } from 'react';
import { parseCSV } from '../io';
import { useStore } from '../store';

export function ImportModal({ onClose }: { onClose: () => void }) {
    const [text, setText] = useState('');
    const [feedback, setFeedback] = useState('');
    const { parts, setParts } = useStore();

    const handleImport = () => {
        const newParts = parseCSV(text);
        if (newParts.length) {
            setParts([...parts, ...newParts]);
            setFeedback(`✅ Successfully imported ${newParts.length} parts.`);
            setTimeout(onClose, 1500);
        } else {
            console.log('Parsed result:', newParts);
            setFeedback('❌ No parts found. Please check your format.');
        }
    };


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const content = ev.target?.result as string;
                setText(content);
                setFeedback(`📂 Loaded file: ${file.name}`);
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="modal" style={{ display: 'flex' }}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Import Parts</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="hint">
                        Format: <code>Name, Width (in), Height (in), Type, HingeSide, Room, Cabinet</code><br />
                        Example: <code>Door 1, 15, 30, door, left, Kitchen, C1</code>
                    </p>

                    <div style={{ marginBottom: 10 }}>
                        <input type="file" accept=".csv" onChange={handleFileChange} />
                    </div>

                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Paste CSV data here or upload a file..."
                    />
                    {feedback && <div style={{ marginTop: 10, fontWeight: 'bold' }}>{feedback}</div>}
                </div>
                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleImport}>Import</button>
                </div>
            </div>
        </div>
    );
}
