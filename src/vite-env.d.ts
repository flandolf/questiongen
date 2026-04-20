/// <reference types="vite/client" />

type MathJaxConfig = {
  tex?: {
    inlineMath?: [string, string][];
    displayMath?: [string, string][];
    packages?: Record<string, string[]>;
  };
  loader?: {
    load?: string[];
  };
  startup?: {
    typeset?: boolean;
    promise?: Promise<unknown>;
  };
  sre?: {
    enabled?: boolean;
  };
  typesetPromise?: (elements?: Element[]) => Promise<void>;
  typesetClear?: (elements?: Element[]) => void;
};

declare global {
  interface Window {
    MathJax?: MathJaxConfig;
    __mathJaxLoaderPromise?: Promise<void>;
  }
}

export {};
