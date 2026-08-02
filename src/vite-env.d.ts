/// <reference types="vite/client" />

declare global {
  interface MathJaxConfig {
    tex?: {
      inlineMath?: [string, string][];
      displayMath?: [string, string][];
    };
    options?: {
      enableEnrichment?: boolean;
      enableSpeech?: boolean;
      enableBraille?: boolean;
      enableMenu?: boolean;
      speechError?: (doc: unknown, math: unknown, error: unknown) => void;
      menuOptions?: {
        settings?: {
          assistiveMml?: boolean;
          enrich?: boolean;
          collapsible?: boolean;
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
