let _ready = false;
let _version = "unknown";

export function setReady(version: string): void {
  _version = version;
  _ready = true;
}

export function isReady(): boolean {
  return _ready;
}

export function getVersion(): string {
  return _version;
}
