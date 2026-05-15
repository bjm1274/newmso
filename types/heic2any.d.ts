declare module 'heic2any' {
  type Heic2AnyOptions = {
    blob: Blob;
    toType?: 'image/jpeg' | 'image/png' | 'image/gif';
    quality?: number;
    multiple?: boolean;
    gifInterval?: number;
  };
  const heic2any: (opts: Heic2AnyOptions) => Promise<Blob | Blob[]>;
  export default heic2any;
}
