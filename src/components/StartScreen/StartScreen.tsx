import { useState, useEffect } from 'react';
import { initDB, getAllWorlds, deleteWorld, type WorldMetadata } from '../../services/StorageService';
import './StartScreen.css';

interface StartScreenProps {
  onCreateWorld: (name: string, seed: number) => void;
  onSelectWorld: (id: string, seed: number, position?: {x: number, y: number, z: number}, rotation?: {x: number, y: number}, worldTime?: number) => void;
}

const StartScreen = ({ onCreateWorld, onSelectWorld }: StartScreenProps) => {
  const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldSeed, setNewWorldSeed] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorlds();
  }, []);

  const loadWorlds = async () => {
    try {
      const db = await initDB();
      const allWorlds = await getAllWorlds(db);
      setWorlds(allWorlds.sort((a, b) => b.lastPlayed - a.lastPlayed));
    } catch (e) {
      console.error('Failed to load worlds', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newWorldName.trim()) return;

    const seed = newWorldSeed.trim() === '' 
      ? Math.floor(Math.random() * 1000000) 
      : parseInt(newWorldSeed) || 0;

    onCreateWorld(newWorldName, seed);
  };

  const handleSelectWorldLocal = (e: React.MouseEvent, id: string, seed: number, position?: {x: number, y: number, z: number}, rotation?: {x: number, y: number}, worldTime?: number) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectWorld(id, seed, position, rotation, worldTime);
  };

  const handleDeleteWorld = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this world? This cannot be undone.')) return;
    
    try {
      const db = await initDB();
      await deleteWorld(db, id);
      await loadWorlds();
    } catch (e) {
      console.error('Failed to delete world', e);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
  };

  return (
    <div className="start-screen-container">
      <div className="start-screen-content">
        <h1 className="game-title">Voxel Craft</h1>
        <p className="game-subtitle">Infinite Procedural Worlds</p>
        
        <div className="worlds-section">
          <div className="worlds-header">
            <h3>Your Worlds</h3>
            <button className="new-world-plus" onClick={() => setShowCreateModal(true)}>
                <span>+</span> New World
            </button>
          </div>

          <div className="worlds-list">
            {loading ? (
              <div className="worlds-status">Loading worlds...</div>
            ) : worlds.length === 0 ? (
              <div className="worlds-status">No worlds found. Create your first one!</div>
            ) : (
              worlds.map(world => (
                <div key={world.id} className="world-item" onClick={(e) => handleSelectWorldLocal(e, world.id, world.seed, world.playerPosition, world.playerRotation, world.worldTime)}>
                  <div className="world-info">
                    <span className="world-name">{world.name}</span>
                    <span className="world-details">Seed: {world.seed} • Played: {formatDate(world.lastPlayed)}</span>
                  </div>
                  <button className="delete-world-btn" onClick={(e) => handleDeleteWorld(e, world.id)} title="Delete World">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <h2>Create New World</h2>
            <form onSubmit={handleCreateSubmit}>
              <div className="input-group">
                <label>World Name</label>
                <input 
                  type="text" 
                  value={newWorldName} 
                  onChange={(e) => setNewWorldName(e.target.value)} 
                  placeholder="My Epic World"
                  autoFocus
                  required
                />
              </div>
              <div className="input-group">
                <label>Seed (Optional)</label>
                <input 
                  type="number" 
                  value={newWorldSeed} 
                  onChange={(e) => setNewWorldSeed(e.target.value)} 
                  placeholder="Random"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="confirm-btn">Create & Play</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StartScreen;
