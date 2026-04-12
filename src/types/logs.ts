export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'debug' | 'info';
  message: string;
  data?: unknown;
}
