import { useState } from 'react';
import { useStore } from '../store';

export function Sidebar() {
    const [activeTab, setActiveTab] = useState<'hinge' | 'slide'>('hinge');
    const db = useStore(s => s.db);
    const displayUnits = useStore(s => s.displayUnits);
    const setDisplayUnits = useStore(s => s.setDisplayUnits);

    // Filter logic for hardware could be moved here or kept simple
    const hinges = (db.Part || []).filter((p: any) => p.Class === '28' || p.Class === '15'); // Simplified

    return (
        <div className="left-panel">
            {/* Hardware Selection */}
            <div className="card">
                <div className="card-header">Hardware</div>
                <div className="card-body">
                    <div className="tab-bar">
                        <div className={`tab ${activeTab === 'hinge' ? 'active' : ''}`} onClick={() => setActiveTab('hinge')}>Hinges</div>
                        <div className={`tab ${activeTab === 'slide' ? 'active' : ''}`} onClick={() => setActiveTab('slide')}>Slides</div>
                    </div>
                    {activeTab === 'hinge' && (
                        <div className="tab-content active">
                            <div className="search-box">
                                <input type="text" placeholder="Search hinges..." />
                            </div>
                            <div className="hardware-list">
                                {hinges.slice(0, 20).map((h: any) => ( // Limitation for render perf
                                    <div key={h.OID} className="hardware-item">
                                        <div className="name">{h.Name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Hinge Configuration */}
            <div className="card">
                <div className="card-header">Hinge Configuration</div>
                <div className="card-body">
                    <div className="form-group">
                        <label>Hinge Side</label>
                        <select id="hinge-side">
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                            <option value="both">Both (Double Door)</option>
                            <option value="top">Top (Flipper)</option>
                            <option value="bottom">Bottom (Tilt-out)</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Number of Hinges</label>
                        <select id="hinge-count">
                            <option value="2">2 Hinges</option>
                            <option value="3">3 Hinges</option>
                        </select>
                    </div>
                    {/* Add other inputs as needed */}
                </div>
            </div>

            {/* Settings */}
            <div className="card">
                <div className="card-header">Settings</div>
                <div className="card-body">
                    <div className="form-group">
                        <label>Display Units</label>
                        <select value={displayUnits} onChange={(e) => setDisplayUnits(e.target.value as any)}>
                            <option value="fraction">Imperial Fractions (15-1/2")</option>
                            <option value="decimal">Decimal Inches (15.5")</option>
                            <option value="metric">Metric (mm)</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}
