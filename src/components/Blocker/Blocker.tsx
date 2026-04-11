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
        <br />
        <p>
          <span className="key">W</span> <span className="key">A</span>{' '}
          <span className="key">S</span> <span className="key">D</span> - Moverse
        </p>
        <p>
          <span className="key">Espacio</span> - Saltar
        </p>
        <p>
          <span className="key">Click Izq</span> - Destruir Bloque
        </p>
        <p>
          <span className="key">Click Der</span> - Colocar Bloque
        </p>
        <p>
          <span className="key">1</span> - <span className="key">5</span> - Seleccionar Bloque
        </p>
      </div>
    </button>
  );
};

export default Blocker;
