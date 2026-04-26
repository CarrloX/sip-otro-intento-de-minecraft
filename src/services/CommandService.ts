type CommandCallback = (...args: string[]) => string | void;

class CommandService {
  private commands: Map<string, CommandCallback> = new Map();

  register(command: string, callback: CommandCallback) {
    this.commands.set(command.toLowerCase(), callback);
  }

  unregister(command: string) {
    this.commands.delete(command.toLowerCase());
  }

  execute(input: string): string {
    const parts = input.trim().split(' ').filter(p => p.length > 0);
    if (parts.length === 0) return '';
    
    const base = parts[0].toLowerCase();

    if (base === '/help') {
       const cmds = Array.from(this.commands.keys()).join(', ');
       return `Available commands: /help, ${cmds}`;
    }

    if (this.commands.has(base)) {
      const result = this.commands.get(base)!(...parts.slice(1));
      return (result as string) || '';
    }

    if (base.startsWith('/')) {
      return `Error: Unknown command. Type /help for help.`;
    }

    return `[You]: ${input}`;
  }
}

export const commandService = new CommandService();
