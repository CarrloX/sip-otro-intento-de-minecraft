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

  const addMessage = (text: string, type: 'command' | 'response' | 'error') => {
    setHistory((prev) => [...prev, { id: Date.now() + Math.random(), text, type }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.nativeEvent.stopImmediatePropagation();
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      if (input.trim()) {
        const cmd = input.trim();
        addMessage(`> ${cmd}`, 'command');
        
        const response = onCommand(cmd);
        if (response) {
          addMessage(response, response.toLowerCase().startsWith('error') ? 'error' : 'response');
        }
        
        setInput('');
        setHistoryIndex(-1);
      } else {
        onClose(); // Close if empty enter
      }
      return;
    }

    // Command history navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const commands = history.filter(m => m.type === 'command');
      if (commands.length > 0) {
        const newIndex = historyIndex < commands.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(commands[commands.length - 1 - newIndex].text.replace(/^> /, ''));
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const commands = history.filter(m => m.type === 'command');
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commands[commands.length - 1 - newIndex].text.replace(/^> /, ''));
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  if (!isOpen) {
    // We can still render the recent history even if closed, like Minecraft chat
    // But for simplicity, we hide it or show just a few lines.
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
        />
      </div>
    </div>
  );
};

export default Console;
