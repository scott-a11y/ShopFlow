import { saveJobToJSON, loadJobFromJSON, exportAllDXF } from '../io';
import { useStore } from '../store';
import { useRef } from 'react';

export function Header() {
    const { parts, dbInfo, setParts } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = () => {
        saveJobToJSON({ parts, date: new Date().toISOString() });
    };

    const handleLoad = () => {
        fileInputRef.current?.click();
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const data = await loadJobFromJSON(file);
                if (data.parts) setParts(data.parts);
            } catch (err) {
                alert('Invalid file');
            }
        }
    };

    const handleExport = () => {
        const sel = parts.filter(p => p.selected !== false);
        if (sel.length) exportAllDXF(sel, 'Job', 2);
        else alert('No parts selected');
    };

    return (
        <div className="header">
            <div>
                <h1>ShopFlow</h1>
                <div className="db-info">{dbInfo}</div>
            </div>
            <div className="header-actions">
                <button className="btn" onClick={() => document.getElementById('import-modal')!.style.display = 'flex'}>📥 Import</button>
                <button className="btn" onClick={handleSave}>💾 Save</button>
                <button className="btn" onClick={handleLoad}>📂 Load</button>
                <button className="btn btn-success" onClick={handleExport}>📤 Export DXF</button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".json"
                    onChange={onFileChange}
                />
            </div>
        </div>
    );
}
