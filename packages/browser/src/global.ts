import * as browser from "./index";

declare global {
  interface Window {
    SubConverter: typeof browser;
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { SubConverter?: typeof browser }).SubConverter = browser;
}

export default browser;
