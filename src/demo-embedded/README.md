# Inverted PostMessage Architecture Demo

This demo showcases an **inverted** PostMessage architecture where:

- **Parent Page**: Acts as the MCP server, implementing medical tools and maintaining patient data
- **Iframe**: Acts as the MCP client, providing the chat/AI interface

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Parent Page (MCP Server) - http://localhost:3100           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Medical Context & Tools:                                │ │
│ │ • Patient data management (John Doe, 45)               │ │
│ │ • Medication tools (add/edit/discontinue/delete)       │ │
│ │ • Allergy management                                    │ │
│ │ • Real-time data updates & history tracking            │ │
│ │ • Tool execution in trusted domain                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                           ↕ PostMessage                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Embedded Iframe (MCP Client) - :3101 in sandbox        │ │
│ │ • Chat interface for AI interaction                     │ │
│ │ • Tool discovery and invocation requests               │ │
│ │ • Secure, sandboxed environment                         │ │
│ │ • Cannot directly access parent data                    │ │
│ │ • Natural language → tool call translation             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Innovation: Inverted Control

**Traditional MCP**: Server runs in iframe, client controls from outside
```
Client (Outside) ←→ PostMessage ←→ Server (Iframe)
```

**Inverted MCP**: Client runs in iframe, server provides tools from outside
```
Server (Outside) ←→ PostMessage ←→ Client (Iframe)
```

## Benefits of Inverted Architecture

1. **Security**: Tool execution happens in the trusted parent domain
2. **Embeddability**: AI chat can be safely embedded in any application  
3. **Data Isolation**: Sensitive data never leaves the parent page
4. **Flexibility**: Parent can control exactly which tools are available
5. **Trust Boundaries**: Clear separation between AI interface and business logic

## Medical Demo Features

### Patient Data Model
- **Patient**: John Doe, 45, MRN-123456
- **Current Medications**: Lisinopril 10mg daily, Metformin 500mg twice daily
- **Known Allergies**: Penicillin (severe, anaphylaxis)
- **Medical History**: Complete audit trail of all changes

### Available Tools
1. **add_medication**: Add new medication to patient's regimen
2. **edit_medication**: Modify existing medication details
3. **discontinue_medication**: Mark medication as discontinued
4. **delete_medication**: Remove medication from record
5. **add_allergy**: Record new patient allergy
6. **get_patient_summary**: Complete patient overview
7. **list_medications**: Show patient medications (filtered by status)
8. **list_allergies**: Show patient allergies

### Demo Scenarios

#### Automated Simulation
Click "Run Simulation" to see:
1. List current active medications
2. Add new medication (Aspirin 81mg for cardiovascular protection)
3. Add new allergy (Shellfish, severe reaction)
4. Get complete patient summary

#### Manual Testing Examples
Try these natural language queries:
- "What medications is the patient taking?"
- "Show me all the patient's allergies"
- "Add Aspirin 81mg once daily prescribed by Dr. Wilson"
- "The patient has a severe allergy to shellfish"
- "Can you give me a complete patient summary?"

## Protocol Implementation

### Message Flow
1. **Handshake**: Iframe → Parent (client announces itself)
2. **Server Reply**: Parent → Iframe (available tools list)
3. **Connection**: Iframe → Parent (confirm established)
4. **Tool Calls**: Iframe → Parent (execute tool with parameters)
5. **Results**: Parent → Iframe (tool execution results)

### Security Features
- **Origin Validation**: All messages validated using `event.origin`
- **Session Management**: Unique session IDs for connection tracking
- **Sandbox Attributes**: Iframe runs with `allow-scripts allow-same-origin allow-forms`
- **Data Isolation**: Medical data never exposed to iframe context

## Running the Demo

### Quick Start
```bash
# Start both servers (recommended)
bun run demo:embedded

# Then open: http://localhost:3100
```

### Manual Start
```bash
# Terminal 1: Start iframe server (MCP Client)
bun run demo:embedded:iframe
# → http://localhost:3101

# Terminal 2: Start parent server (MCP Server)  
bun run demo:embedded:parent
# → http://localhost:3100
```

### What You'll See
1. **Parent Page**: Real-time patient data, medication lists, medical history
2. **Embedded Chat**: AI assistant interface within iframe
3. **Live Updates**: Patient data updates in real-time as tools execute
4. **Tool Visualization**: See tool calls and results in chat interface

## File Structure

```
src/demo-embedded/
├── README.md                 # This comprehensive guide
├── parent/                   # MCP Server (parent page)
│   ├── index.html           # Main demo page with patient data display
│   ├── app.ts               # Medical server implementation & PostMessage handling
│   ├── medical-tools.ts     # Tool implementations (add_medication, etc.)
│   └── patient-data.ts      # Data models, state management & validation
├── iframe/                   # MCP Client (embedded)
│   ├── index.html           # Chat interface with modern UI
│   ├── app.ts               # Client implementation & natural language processing
│   └── chat-ui.ts           # Chat components, message rendering & tool visualization
└── shared/                   # Shared utilities
    ├── types.ts             # TypeScript interfaces for medical data
    └── protocol.ts          # Inverted protocol message definitions
```

## Technical Details

### TypeScript Implementation
- **Fully Typed**: Complete TypeScript coverage with proper interfaces
- **Type Safety**: Compile-time validation of message protocols
- **Modern ESM**: ES modules with proper import/export

### UI/UX Features
- **Responsive Design**: Works on desktop and mobile
- **Real-time Updates**: Live patient data synchronization
- **Modern Chat UI**: Professional medical interface
- **Tool Visualization**: See tool parameters and results
- **Status Indicators**: Connection status and processing feedback

### Error Handling
- **Validation**: Input validation for all medical data
- **Duplicate Prevention**: Prevents duplicate medications/allergies
- **Graceful Degradation**: Proper error messages and recovery
- **Audit Trail**: Complete history of all changes

## Use Cases

### Healthcare Applications
- **EMR Integration**: Embed AI assistant in electronic medical records
- **Clinical Decision Support**: AI-powered medication management
- **Patient Portals**: Secure patient data interaction
- **Telemedicine**: Remote consultation tools

### General Applications
- **Financial Apps**: AI assistant with secure transaction tools
- **CRM Systems**: Customer data management with AI
- **Admin Dashboards**: AI-powered business tool execution
- **Educational Platforms**: AI tutors with grading tools

## Development Notes

### Security Considerations
- **Origin Pinning**: Server remembers client origin after handshake
- **Iframe Sandbox**: Prevents direct DOM access to parent
- **Message Validation**: All PostMessage content validated
- **Data Encapsulation**: Medical data never exposed to iframe

### Performance Optimizations
- **Efficient Bundling**: Small JavaScript bundles (< 35KB)
- **Lazy Loading**: UI components loaded on demand
- **Memory Management**: Proper cleanup of event listeners
- **DOM Optimization**: Efficient message rendering

### Testing Strategy
- **Manual Testing**: Interactive demo scenarios
- **Automated Simulation**: Scripted tool execution
- **Error Scenarios**: Invalid input handling
- **Cross-Origin**: PostMessage security validation

---

This demo represents a novel approach to embedding AI capabilities while maintaining security and data isolation. The inverted architecture enables powerful AI assistants that can safely operate within existing applications without compromising sensitive data or business logic.