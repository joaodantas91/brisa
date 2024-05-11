import { gzipSync } from "bun";
import { brotliCompressSync } from "node:zlib";
import getFilesFromDir from "@/utils/get-files-from-dir";

export default async function precompressAssets(assetsPath: string) {
  const assets = await getFilesFromDir(assetsPath);

  await Promise.all(
    assets.map(async (asset) => {
      if (asset.endsWith(".gz") || asset.endsWith(".br")) return;

      const assetContent = Bun.file(asset);
      const buffer = new Uint8Array(await assetContent.arrayBuffer());
      const gzip = gzipSync(buffer);

      Bun.write(`${asset}.gz`, gzip);
      Bun.write(`${asset}.br`, brotliCompressSync(buffer));
    }),
  );
}
