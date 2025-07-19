# Deployment Guide

This document explains how the MCP PostMessage Transport demo is built and deployed to GitHub Pages.

## Build Process

The project uses a custom Bun-based build script (`build.ts`) that:

1. **Cleans** the `dist/` directory
2. **Builds the demo client** (`src/demo/client/`) using Bun's HTML bundler
3. **Builds each demo server** (`src/demo/servers/*/`) individually
4. **Creates a root index.html** with navigation to all components
5. **Configures URLs** automatically for production/development environments

### Build Commands

```bash
# Build for production
bun run build

# Build SDK only (for library usage)
bun run build:sdk

# Preview the built site locally
bun run preview
```

## Deployment

### Automatic Deployment

The project deploys automatically to GitHub Pages via GitHub Actions:

- **Trigger**: Push to `main` branch or manual workflow dispatch
- **Build**: Runs `bun run build` on Ubuntu latest
- **Deploy**: Uploads `dist/` folder to GitHub Pages

### Manual Deployment

To deploy manually:

1. Run `bun run build` locally
2. Commit and push the changes
3. The GitHub Action will handle deployment

## Environment Configuration

The demo client automatically detects the environment:

- **Development** (`localhost`): Uses `http://localhost:3001/server-name`
- **Production** (GitHub Pages): Uses relative URLs like `/servers/server-name/`

## File Structure

After building, the `dist/` folder contains:

```
dist/
├── index.html              # Root landing page
├── client/                 # Demo client app
│   ├── index.html
│   └── chunk-*.js
└── servers/                # Individual server demos
    ├── pi-calculator/
    │   ├── index.html
    │   └── chunk-*.js
    ├── mermaid-editor/
    │   ├── index.html
    │   └── chunk-*.js
    └── json-analyzer/
        ├── index.html
        └── chunk-*.js
```

## URLs

Once deployed, the demo is accessible at:

- **Main site**: `https://username.github.io/repo-name/`
- **Demo client**: `https://username.github.io/repo-name/client/`
- **Pi Calculator**: `https://username.github.io/repo-name/servers/pi-calculator/`
- **Mermaid Editor**: `https://username.github.io/repo-name/servers/mermaid-editor/`
- **JSON Analyzer**: `https://username.github.io/repo-name/servers/json-analyzer/`

## Development vs Production

### Development Mode
```bash
# Start all servers locally
bun run demo

# Or start individually
bun run demo:client    # Port 3000
bun run demo:pi        # Port 3001
bun run demo:mermaid   # Port 3001
bun run demo:json      # Port 3001
```

### Production Mode
```bash
# Build for production
bun run build

# Preview locally
bun run preview
```

## Troubleshooting

### Build Failures

1. Ensure all dependencies are installed: `bun install`
2. Check TypeScript errors: `bun run type-check`
3. Verify file paths in `src/demo/`

### Deployment Issues

1. Check GitHub Actions logs in the repository
2. Verify GitHub Pages is enabled in repository settings
3. Ensure the `deploy.yml` workflow has proper permissions

### CORS Issues

If servers can't communicate after deployment:

1. Check that URLs are using the same origin
2. Verify the `allowedOrigins` configuration in server transport files
3. Ensure proper path mapping in the built application