import { useState, useEffect } from 'react';
import './App.css';
import { useMinecraft } from './hooks/useMinecraft';

function App() {
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const { mountRef, isLocked, lockControls } = useMinecraft(currentBlockType);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const code = event.code;
      
      if (code === 'Digit1' || key === '1') setCurrentBlockType(1);
      if (code === 'Digit2' || key === '2') setCurrentBlockType(2);
      if (code === 'Digit3' || key === '3') setCurrentBlockType(3);
      if (code === 'Digit4' || key === '4') setCurrentBlockType(4);
      if (code === 'Digit5' || key === '5') setCurrentBlockType(5);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Contenedor dedicado exclusivamente al canvas de Three.js */}
      <div 
        ref={mountRef} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} 
      />

      <div id="ui-layer" style={{ zIndex: 10, position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' }}>
        {isLocked && <div id="crosshair"></div>}
        
        {isLocked && (
          <div id="hotbar" style={{ pointerEvents: 'auto' }}>
            {[1, 2, 3, 4, 5].map((num) => (
              <div
                key={num}
                className={`slot ${currentBlockType === num ? 'active' : ''}`}
                id={`slot-${num}`}
                title={`${num} - Bloque`}
              ></div>
            ))}
          </div>
        )}
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
