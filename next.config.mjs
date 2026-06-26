/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(), // Explicitly use current working directory as root
  },
};

export default nextConfig;
