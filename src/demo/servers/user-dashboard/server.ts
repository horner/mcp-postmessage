/**
 * User Dashboard - Inverted Architecture Demo
 * 
 * This demonstrates an MCP Server running in the OUTER FRAME that embeds
 * an MCP Client in an iframe. The server provides tools that give the
 * client access to user data and application context.
 * 
 * Architecture: Outer Frame MCP Server + Inner Frame MCP Client
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { OuterFrameTransport, IframeWindowControl } from '$sdk/transport/postmessage/index.js';
import { generateSessionId } from '$sdk/utils/helpers.js';

// ============================================================================
// USER DATA SERVICE
// ============================================================================

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  avatar: string;
  lastLogin: string;
  permissions: string[];
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
    language: string;
  };
}

interface ProjectInfo {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'on-hold';
  progress: number;
  team: string[];
  deadline: string;
}

class UserDataService {
  private static readonly MOCK_USER: UserProfile = {
    id: 'user-001',
    name: 'Alice Johnson',
    email: 'alice.johnson@company.com',
    role: 'Administrator',
    department: 'Engineering',
    avatar: 'A',
    lastLogin: 'Today at 2:45 PM',
    permissions: ['read', 'write', 'admin', 'manage-users', 'view-analytics'],
    preferences: {
      theme: 'light',
      notifications: true,
      language: 'en-US'
    }
  };

  private static readonly MOCK_PROJECTS: ProjectInfo[] = [
    {
      id: 'proj-001',
      name: 'Q4 Platform Redesign',
      status: 'active',
      progress: 75,
      team: ['Alice', 'Bob', 'Carol'],
      deadline: '2024-12-15'
    },
    {
      id: 'proj-002', 
      name: 'API v3 Migration',
      status: 'active',
      progress: 45,
      team: ['Alice', 'David', 'Eve'],
      deadline: '2024-11-30'
    },
    {
      id: 'proj-003',
      name: 'Mobile App Launch',
      status: 'on-hold',
      progress: 20,
      team: ['Frank', 'Grace'],
      deadline: '2025-01-31'
    }
  ];

  static getCurrentUser(): UserProfile {
    return this.MOCK_USER;
  }

  static getUserProjects(): ProjectInfo[] {
    return this.MOCK_PROJECTS.filter(p => p.team.includes(this.MOCK_USER.name));
  }

  static getSystemHealth(): {
    overall: number;
    services: { name: string; status: 'healthy' | 'warning' | 'error'; uptime: number }[];
  } {
    return {
      overall: 89,
      services: [
        { name: 'API Gateway', status: 'healthy', uptime: 99.9 },
        { name: 'Database', status: 'healthy', uptime: 99.7 },
        { name: 'File Storage', status: 'warning', uptime: 97.2 },
        { name: 'Analytics', status: 'healthy', uptime: 99.5 }
      ]
    };
  }

  static getTeamStats(): {
    totalMembers: number;
    activeProjects: number;
    completedThisMonth: number;
  } {
    return {
      totalMembers: 156,
      activeProjects: 24,
      completedThisMonth: 8
    };
  }
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

function createUserDashboardServer(): McpServer {
  const server = new McpServer({
    name: 'user-dashboard',
    version: '1.0.0',
  });

  // Tool: Get current user information
  server.registerTool(
    'getCurrentUser',
    {
      title: 'Get Current User',
      description: 'Get information about the currently logged in user',
      inputSchema: {}
    },
    async () => {
      const user = UserDataService.getCurrentUser();
      
      return {
        content: [{
          type: 'text',
          text: `👤 **Current User Information**

**Name:** ${user.name}
**Email:** ${user.email}
**Role:** ${user.role}
**Department:** ${user.department}
**Last Login:** ${user.lastLogin}

**Permissions:** ${user.permissions.join(', ')}

**Preferences:**
- Theme: ${user.preferences.theme}
- Notifications: ${user.preferences.notifications ? 'Enabled' : 'Disabled'}
- Language: ${user.preferences.language}`
        }]
      };
    }
  );

  // Tool: Get user's projects
  server.registerTool(
    'getUserProjects',
    {
      title: 'Get User Projects',
      description: 'Get all projects assigned to the current user',
      inputSchema: {}
    },
    async () => {
      const projects = UserDataService.getUserProjects();
      
      const projectList = projects.map(p => 
        `• **${p.name}** (${p.status}) - ${p.progress}% complete, deadline: ${p.deadline}`
      ).join('\n');
      
      return {
        content: [{
          type: 'text',
          text: `📂 **Your Projects** (${projects.length} total)

${projectList}

You can ask me about specific project details or request updates on any of these projects.`
        }]
      };
    }
  );

  // Tool: Get system health
  server.registerTool(
    'getSystemHealth',
    {
      title: 'Get System Health',
      description: 'Get current system status and health metrics',
      inputSchema: {}
    },
    async () => {
      const health = UserDataService.getSystemHealth();
      
      const serviceList = health.services.map(s => {
        const icon = s.status === 'healthy' ? '✅' : s.status === 'warning' ? '⚠️' : '❌';
        return `${icon} **${s.name}**: ${s.status} (${s.uptime}% uptime)`;
      }).join('\n');
      
      return {
        content: [{
          type: 'text',
          text: `🏥 **System Health Report**

**Overall Health:** ${health.overall}%

**Service Status:**
${serviceList}

All critical systems are operational. The File Storage service is experiencing minor performance issues but remains functional.`
        }]
      };
    }
  );

  // Tool: Get team statistics
  server.registerTool(
    'getTeamStats',
    {
      title: 'Get Team Statistics',
      description: 'Get statistics about team size, projects, and recent activity',
      inputSchema: {}
    },
    async () => {
      const stats = UserDataService.getTeamStats();
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Team Statistics**

**👥 Team Size:** ${stats.totalMembers} members across all departments
**🚀 Active Projects:** ${stats.activeProjects} projects currently in progress
**✅ Completed This Month:** ${stats.completedThisMonth} projects delivered successfully

The team is performing well with a steady completion rate and healthy project pipeline.`
        }]
      };
    }
  );

  return server;
}

// ============================================================================
// UI MANAGEMENT
// ============================================================================

class DashboardUI {
  private copilotIframe: HTMLIFrameElement;
  private statusElement: HTMLElement;
  private loadingElement: HTMLElement;
  private errorElement: HTMLElement;
  
  constructor() {
    this.copilotIframe = document.getElementById('copilot-iframe') as HTMLIFrameElement;
    this.statusElement = document.getElementById('copilot-status') as HTMLElement;
    this.loadingElement = document.getElementById('loading-state') as HTMLElement;
    this.errorElement = document.getElementById('error-state') as HTMLElement;
  }

  showLoading() {
    this.copilotIframe.style.display = 'none';
    this.loadingElement.style.display = 'flex';
    this.errorElement.style.display = 'none';
    this.statusElement.textContent = 'Connecting...';
    this.statusElement.style.background = '#f39c12';
  }

  showConnected() {
    this.copilotIframe.style.display = 'block';
    this.loadingElement.style.display = 'none';
    this.errorElement.style.display = 'none';
    this.statusElement.textContent = 'Connected';
    this.statusElement.style.background = '#00b894';
  }

  showError() {
    this.copilotIframe.style.display = 'none';
    this.loadingElement.style.display = 'none';
    this.errorElement.style.display = 'flex';
    this.statusElement.textContent = 'Disconnected';
    this.statusElement.style.background = '#e17055';
  }

  getIframe(): HTMLIFrameElement {
    return this.copilotIframe;
  }
}

// ============================================================================
// MAIN APPLICATION
// ============================================================================

async function initializeCopilot() {
  const ui = new DashboardUI();
  ui.showLoading();

  try {
    console.log('[USER-DASHBOARD] Creating MCP server...');
    const server = createUserDashboardServer();
    
    console.log('[USER-DASHBOARD] Setting up iframe window control...');
    const windowControl = new IframeWindowControl({
      iframe: ui.getIframe(),
      setVisible: () => {}, // Always visible
      onError: (error) => {
        console.error('[USER-DASHBOARD] Iframe error:', error);
        ui.showError();
      }
    });

    console.log('[USER-DASHBOARD] Creating transport...');
    const transport = new OuterFrameTransport(windowControl, {
      serverUrl: './ai-copilot/',  // Will be created in next step
      sessionId: generateSessionId()
    });

    console.log('[USER-DASHBOARD] Connecting MCP server to transport...');
    await server.connect(transport);
    
    console.log('[USER-DASHBOARD] Navigating to copilot URL...');
    await windowControl.navigate('./ai-copilot/');
    
    console.log('[USER-DASHBOARD] AI Copilot initialized successfully');
    ui.showConnected();
    
  } catch (error) {
    console.error('[USER-DASHBOARD] Failed to initialize copilot:', error);
    ui.showError();
  }
}

// Make initializeCopilot available globally for retry button
(window as any).initializeCopilot = initializeCopilot;

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('[USER-DASHBOARD] Page loaded, initializing copilot...');
  initializeCopilot();
});

console.log('[USER-DASHBOARD] User Dashboard server script loaded');