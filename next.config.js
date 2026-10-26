/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite (the local fallback database) loads its own WebAssembly files.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
