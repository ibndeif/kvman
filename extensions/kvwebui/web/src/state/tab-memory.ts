// What a browser tab remembers (ADR 0009, 74): its own value in `sessionStorage`, which survives its reloads, and the
// last value chosen in any tab in `localStorage`, where a new tab starts.

export type TabMemory = { read(): string | null; write(value: string | null): void };

export function tabMemory(key: string): TabMemory {
  return {
    read: () => sessionStorage.getItem(key) ?? localStorage.getItem(key),
    write: (value) => {
      for (const storage of [sessionStorage, localStorage]) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
    },
  };
}
