const k = ['a7','Qm','2P','x9','Lf','0s','Vr','8N'].join('');
const z = new TextEncoder();
const u = new TextDecoder();
const y = (v: string): Uint8Array => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
const b = (v: Uint8Array): ArrayBuffer => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
const x = async (s: Uint8Array): Promise<CryptoKey> => crypto.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt: b(s), iterations: 131071 },
  await crypto.subtle.importKey('raw', b(z.encode(k)), 'PBKDF2', false, ['deriveKey']),
  { name: 'AES-GCM', length: 256 },
  false,
  ['decrypt'],
);
export const q = async <T>(v: string): Promise<T> => {
  const o = JSON.parse(v) as { a: string; b: string; c: string };
  const d = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(y(o.b)) }, await x(y(o.a)), b(y(o.c)));
  return JSON.parse(u.decode(d)) as T;
};
