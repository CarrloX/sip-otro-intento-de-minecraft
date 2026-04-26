import React, { useState, useEffect, useRef } from 'react';
import './Console.css';

interface ConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onCommand: (command: string) => string | void; // Returns a response message
}

interface Message {
  id: number;
  text: string;
  type: 'command' | 'response' | 'error';
}

const Console: React.FC<ConsoleProps> = ({ isOpen, onClose, onCommand }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    } else {
      setInput('');
      setHistoryIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      globalThis.addEventListener('keydown', handleGlobalKeyDown);
    }

    return () => {
      globalThis.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen, onClose]);

  const addMessage = (text: string, type: 'command' | 'response' | 'error') => {
    setHistory((prev) => [...prev, { id: Date.now() + Math.random(), text, type }]);
  };

  const handleEnter = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      onClose();
      return;
    }

    addMessage(`> ${trimmedInput}`, 'command');
    const response = onCommand(trimmedInput);
    
    if (response) {
      const isError = response.toLowerCase().startsWith('error');
      addMessage(response, isError ? 'error' : 'response');
    }
    
    setInput('');
    setHistoryIndex(-1);
  };

  const handleArrowUp = () => {
    const commands = history.filter(m => m.type === 'command');
    if (commands.length === 0) return;

    const newIndex = historyIndex < commands.length - 1 ? historyIndex + 1 : historyIndex;
    setHistoryIndex(newIndex);
    setInput(commands[commands.length - 1 - newIndex].text.replace(/^> /, ''));
  };

  const handleArrowDown = () => {
    const commands = history.filter(m => m.type === 'command');
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setInput(commands[commands.length - 1 - newIndex].text.replace(/^> /, ''));
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.nativeEvent.stopImmediatePropagation();
    e.stopPropagation();
    
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'Enter':
        handleEnter();
        break;
      case 'ArrowUp':
        e.preventDefault();
        handleArrowUp();
        break;
      case 'ArrowDown':
        e.preventDefault();
        handleArrowDown();
        break;
      default:
        break;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="console-overlay">
      <div className="console-history">
        {history.map((msg) => (
          <div key={msg.id} className={`console-message ${msg.type}`}>
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="console-input-container">
        <span className="console-prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          className="console-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
          placeholder="Type a command..."
          aria-label="Console command input"
        />
      </div>
    </div>
  );
};

export default Console;
