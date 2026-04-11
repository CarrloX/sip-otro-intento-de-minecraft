import './Blocker.css';

interface BlockerProps {
  isVisible: boolean;
  onLock: () => void;
}

const Blocker = ({ isVisible, onLock }: BlockerProps) => {
  if (!isVisible) return null;

  return (
    <button id="blocker" onClick={onLock} type="button">
      <div id="instructions">
        <h1>Minecraft React</h1>
        <p>Haz clic para jugar</p>
      </div>
    </button>
  );
};

export default Blocker;
