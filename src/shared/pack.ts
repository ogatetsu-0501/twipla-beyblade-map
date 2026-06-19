const k = ['a7','Qm','2P','x9','Lf','0s','Vr','8N'].join('');
const z = new TextEncoder();
const b = (v: Uint8Array): ArrayBuffer => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
const y = (v: Uint8Array): string => Buffer.from(v).toString('base64');
const x = async (s: Uint8Array): Promise<CryptoKey> => crypto.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt: b(s), iterations: 131071 },
  await crypto.subtle.importKey('raw', b(z.encode(k)), 'PBKDF2', false, ['deriveKey']),
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
export const q = async (v: unknown): Promise<string> => {
  const s = crypto.getRandomValues(new Uint8Array(16));
  const i = crypto.getRandomValues(new Uint8Array(12));
  const d = z.encode(JSON.stringify(v));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: b(i) }, await x(s), b(d)));
  return JSON.stringify({ a: y(s), b: y(i), c: y(c) });
};
