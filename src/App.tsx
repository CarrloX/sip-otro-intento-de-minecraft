import { useState } from 'react';
import './App.css';
import { useMinecraft } from './hooks/useMinecraft';
import Hotbar from './components/Hotbar/Hotbar';
import Crosshair from './components/Crosshair/Crosshair';

function App() {
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const { mountRef, isLocked, lockControls } = useMinecraft(currentBlockType);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Contenedor dedicado exclusivamente al canvas de Three.js */}
      <div 
        ref={mountRef} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} 
      />

      <div id="ui-layer" style={{ zIndex: 10, position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' }}>
        <Crosshair isVisible={isLocked} />
        
        <Hotbar isVisible={isLocked} onBlockChange={setCurrentBlockType} />
      </div>

      {!isLocked && (
        <div id="blocker" onClick={lockControls}>
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
        </div>
      )}
    </div>
  );
}

export default App;
