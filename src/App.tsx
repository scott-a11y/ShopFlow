import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Preview } from './components/Preview';
import { PartsList } from './components/PartsList';
import { StatsBar } from './components/StatsBar';
import { ImportModal } from './components/ImportModal';
import { useStore } from './store';
import { NestingView } from './components/NestingView';

export default function App() {
    const setDB = useStore(s => s.setDB);
    const [view, setView] = useState<'design' | 'nesting'>('design');
    // const [showImport, setShowImport] = useState(false);


    useEffect(() => {
        fetch('data/CabinetSenseDB_combined.json')
            .then(res => res.json())
            .then(data => setDB(data.tables))
            .catch(err => console.error(err));
    }, []);

    // Helper to toggle modal (can pass to header)
    useEffect(() => {
        // Quick hack to hook up the 'element' style display from Header
        // In real React, we'd pass props. 
        // For phase 2 MVP, I'll rely on global ID or refactor Header to accept props.
        // Let's Refactor Header to accept onImport prop? 
        // Or just let Header render the modal? 
        // Let's put Modal in App and use a simple state.
    }, []);

    return (
        <div className="app-container">
            <Header />
            {/* View Switcher */}
            <div style={{ padding: '0 20px', borderBottom: '1px solid #334155' }}>
                <button
                    className={`btn ${view === 'design' ? 'btn-primary' : ''}`}
                    onClick={() => setView('design')}
                    style={{ marginRight: 10 }}
                >
                    Design
                </button>
                <button
                    className={`btn ${view === 'nesting' ? 'btn-primary' : ''}`}
                    onClick={() => setView('nesting')}
                >
                    Nesting & CAM
                </button>
            </div>

            <div className="container" style={{ display: view === 'design' ? 'flex' : 'none' }}>
                {/* Job Info Bar - Can be componentized later */}
                <div className="job-info-bar">
                    <div className="job-field"><label>Job #</label><input placeholder="2024-001" /></div>
                    <div className="job-field"><label>Customer</label><input placeholder="Name" /></div>
                    <div className="job-field"><label>Date</label><input type="date" /></div>
                    <div className="job-field" style={{ flex: 2 }}><label>Notes</label><input /></div>
                </div>

                <StatsBar />

                <div className="grid">
                    <Sidebar />
                    <Preview />
                    <PartsList />
                </div>
            </div>

            {view === 'nesting' && <NestingView />}

            {/* Modal placeholder - controlled by ID in Header for now, or add state */}
            <div id="import-modal" className="modal" style={{ display: 'none' }}>
                <ImportModal onClose={() => document.getElementById('import-modal')!.style.display = 'none'} />
            </div>
        </div>
    );
}


