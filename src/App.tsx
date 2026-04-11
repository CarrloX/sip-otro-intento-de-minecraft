import { useState } from 'react';
import './App.css';
import { useMinecraft } from './hooks/useMinecraft';
import Hotbar from './components/Hotbar/Hotbar';
import Crosshair from './components/Crosshair/Crosshair';

function App() {
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const { mountRef, isLocked, lockControls } = useMinecraft(currentBlockType);

  return (
    <div className="app-container">
      {/* Contenedor dedicado exclusivamente al canvas de Three.js */}
      <div 
        ref={mountRef} 
        className="game-mount" 
      />

      <div id="ui-layer">
        <Crosshair isVisible={isLocked} />
        
        <Hotbar isVisible={isLocked} onBlockChange={setCurrentBlockType} />
      </div>

      {!isLocked && (
        <button id="blocker" onClick={lockControls} type="button">
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
      )}
    </div>
  );
}

export default App;
