import './StartScreen.css';

interface StartScreenProps {
  onCreateWorld: (seed: number) => void;
}

const StartScreen = ({ onCreateWorld }: StartScreenProps) => {
  const handleCreateWorld = () => {
    // Generate a random seed between 0 and 1000000
    const randomSeed = Math.floor(Math.random() * 1000000);
    onCreateWorld(randomSeed);
  };

  return (
    <div className="start-screen-container">
      <div className="start-screen-content">
        <h1 className="game-title">Voxel Craft</h1>
        <p className="game-subtitle">Infinite Procedural Worlds</p>
        
        <button className="create-world-button" onClick={handleCreateWorld}>
          <span className="button-text">Create World</span>
          <div className="button-glow"></div>
        </button>
      </div>
    </div>
  );
};

export default StartScreen;
