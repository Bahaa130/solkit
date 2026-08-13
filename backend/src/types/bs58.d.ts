// إعلان نوع مبسّط لوحدة bs58 (CommonJS، بلا @types)
declare module "bs58" {
  /** فك ترميز نص base58 إلى Buffer */
  export function decode(str: string): Buffer;
  /** ترميز Buffer إلى نص base58 */
  export function encode(buf: Uint8Array | Buffer): string;
  const bs58: { decode: typeof decode; encode: typeof encode };
  export default bs58;
}
