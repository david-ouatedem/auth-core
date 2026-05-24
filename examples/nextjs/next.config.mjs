/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace AuthCore packages so Next can resolve workspace:^ imports.
  transpilePackages: [
    '@authcore/core',
    '@authcore/core-web',
    '@authcore/drizzle-adapter',
    '@authcore/nextjs',
    '@authcore/react',
    '@authcore/types',
  ],
  // better-sqlite3 is a native module; tell Next not to try bundling it for the server.
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
