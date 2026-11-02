/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ONBOARDING_DISABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
