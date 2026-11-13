import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los contratos se comparten como código TypeScript fuente
  transpilePackages: ["@agrocore/contracts"],
  // Shared/contracts vive FUERA de Frontend/ (enlace en node_modules): Turbopack solo resuelve
  // archivos dentro de su raíz, así que la raíz debe ser el monorepo.
  turbopack: { root: path.join(__dirname, "..") },
};

export default nextConfig;
