/// <reference types="vite/client" />

declare global {
  interface MathJaxConfig {
    tex?: {
      inlineMath?: [string, string][];
      displayMath?: [string, string][];
      packages?: Record<string, string[]>;
    };
    loader?: {
      load?: string[];
    };
    options?: {
      enableAssistiveMml?: boolean;
      enableMenu?: boolean;
      menuOptions?: {
        settings?: {
          assistiveMml?: boolean;
          explorer?: boolean;
          speech?: boolean;
          braille?: boolean;
        };
      };
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
  }

  interface Window {
    MathJax?: MathJaxConfig;
    __mathJaxLoaderPromise?: Promise<void>;
  }
}

export {};
