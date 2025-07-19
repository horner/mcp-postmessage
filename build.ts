#!/usr/bin/env bun
/**
 * Build script for MCP PostMessage Transport Demo
 * Builds the complete app for GitHub Pages deployment
 */

import { existsSync } from 'fs';
import { rmdir, mkdir, copyFile, readdir, stat } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';

// Configuration
const BUILD_CONFIG = {
  // Source directories
  demoClient: 'src/demo/client',
  demoServers: 'src/demo/servers',
  
  // Output directory
  outDir: 'dist',
  
  // Build settings
  minify: true,
  sourcemap: 'none',
  target: 'browser',
} as const;

/**
 * Clean the dist directory
 */
async function clean() {
  console.log('🧹 Cleaning dist directory...');
  
  if (existsSync(BUILD_CONFIG.outDir)) {
    await rmdir(BUILD_CONFIG.outDir, { recursive: true });
  }
  
  await mkdir(BUILD_CONFIG.outDir, { recursive: true });
  await mkdir(join(BUILD_CONFIG.outDir, 'client'), { recursive: true });
  await mkdir(join(BUILD_CONFIG.outDir, 'servers'), { recursive: true });
}

/**
 * Copy files recursively
 */
async function copyDirectory(src: string, dest: string, filter?: (file: string) => boolean) {
  const entries = await readdir(src);
  
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stats = await stat(srcPath);
    
    if (stats.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath, filter);
    } else if (!filter || filter(entry)) {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Build the demo client
 */
async function buildClient() {
  console.log('📦 Building demo client...');
  
  // Load production server configuration
  const productionServers = await loadProductionServers();
  
  // Build client to root of dist (not in /client subdirectory)
  const result = await Bun.build({
    entrypoints: [join(BUILD_CONFIG.demoClient, 'index.html')],
    outdir: BUILD_CONFIG.outDir,
    minify: BUILD_CONFIG.minify,
    target: BUILD_CONFIG.target,
    define: {
      // Replace with production server data at build time
      "PRODUCTION_SERVERS": JSON.stringify(productionServers)
    }
  });
  
  if (!result.success) {
    console.error('❌ Client build failed:');
    for (const error of result.logs) {
      console.error(error);
    }
    throw new Error('Client build failed');
  }
  
  console.log('✅ Client built successfully');
}

/**
 * Build the demo servers
 */
async function buildServers() {
  console.log('📦 Building demo servers...');
  
  const serversDir = BUILD_CONFIG.demoServers;
  const servers = await readdir(serversDir);
  
  for (const server of servers) {
    const serverPath = join(serversDir, server);
    const stats = await stat(serverPath);
    
    if (stats.isDirectory()) {
      console.log(`  Building ${server}...`);
      
      const serverOutDir = join(BUILD_CONFIG.outDir, 'servers', server);
      await mkdir(serverOutDir, { recursive: true });
      
      const result = await Bun.build({
        entrypoints: [join(serverPath, 'index.html')],
        outdir: serverOutDir,
        minify: BUILD_CONFIG.minify,
        target: BUILD_CONFIG.target,
      });
      
      if (!result.success) {
        console.error(`❌ Server ${server} build failed:`);
        for (const error of result.logs) {
          console.error(error);
        }
        throw new Error(`Server ${server} build failed`);
      }
      
      console.log(`  ✅ ${server} built successfully`);
    }
  }
}



/**
 * Load production server configuration
 */
async function loadProductionServers() {
  const prodServersPath = join(BUILD_CONFIG.demoClient, 'servers.prod.json');
  const prodServers = await Bun.file(prodServersPath).json();
  return prodServers;
}

/**
 * Main build function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting MCP PostMessage Transport build...\n');
    
    await clean();
    await buildClient();
    await buildServers();
    
    const duration = Date.now() - startTime;
    console.log(`\n✅ Build completed successfully in ${duration}ms`);
    console.log(`📁 Output directory: ${BUILD_CONFIG.outDir}/`);
    console.log(`🌐 Ready for deployment to GitHub Pages`);
    
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
}

// Run the build if this script is executed directly
if (import.meta.main) {
  main();
}