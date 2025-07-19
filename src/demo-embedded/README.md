# Inverted PostMessage Architecture Demo

This demo showcases an **inverted** PostMessage architecture where:

- **Parent Page**: Acts as the MCP server, implementing medical tools and maintaining patient data
- **Iframe**: Acts as the MCP client, providing the chat/AI interface

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Parent Page (MCP Server)                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Medical Context & Tools:                                │ │
│ │ • Patient data management                               │ │
│ │ • Medication tools (add/edit/discontinue/delete)       │ │
│ │ • Allergy management                                    │ │
│ │ • Tool execution in trusted domain                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                           ↕ PostMessage                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Embedded Iframe (MCP Client)                            │ │
│ │ • Chat interface for AI interaction                     │ │
│ │ • Tool discovery and invocation                         │ │
│ │ • Secure, sandboxed environment                         │ │
│ │ • Cannot directly access parent data                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Benefits of Inverted Architecture

1. **Security**: Tool execution happens in the trusted parent domain
2. **Embeddability**: AI chat can be safely embedded in any application  
3. **Data Isolation**: Sensitive data never leaves the parent page
4. **Flexibility**: Parent can control exactly which tools are available

## Medical Demo Features

### Patient Data Model
- Basic patient information (name, age, medical record number)
- Current medications with dosages and schedules
- Known allergies and severity levels
- Medical history tracking

### Available Tools
1. **add_medication**: Add new medication to patient's regimen
2. **edit_medication**: Modify existing medication details
3. **discontinue_medication**: Mark medication as discontinued
4. **delete_medication**: Remove medication from record
5. **add_allergy**: Record new patient allergy

### Demo Scenarios
- **Run Simulation**: Automated demo showing tool interactions
- **Manual Testing**: Interactive chat interface for testing tools
- **Error Handling**: Demonstrations of validation and error scenarios

## Running the Demo

```bash
# Start the demo on port 3100 (parent) and 3101 (iframe)
bun run demo:embedded
```

## File Structure

```
src/demo-embedded/
├── README.md                 # This file
├── parent/                   # MCP Server (parent page)
│   ├── index.html           # Main demo page
│   ├── app.ts               # Medical server implementation
│   ├── medical-tools.ts     # Tool implementations
│   └── patient-data.ts      # Data models and state
├── iframe/                   # MCP Client (embedded)
│   ├── index.html           # Chat interface
│   ├── app.ts               # Client implementation
│   └── chat-ui.ts           # Chat components
└── shared/                   # Shared utilities
    ├── types.ts             # Common type definitions
    └── protocol.ts          # Inverted protocol messages
```