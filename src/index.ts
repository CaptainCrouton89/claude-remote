import cors from "cors";
import express from "express";
import fs from "fs/promises";
import helmet from "helmet";
import path from "path";
import { claudeRouter } from "./routes/claude";
import { gitRouter } from "./routes/git";

const app = express();
const PORT = process.env.PORT || 3955;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure repos directory exists
const ensureReposDirectory = async () => {
  const reposPath = path.join(process.cwd(), "repos");
  try {
    await fs.access(reposPath);
  } catch {
    await fs.mkdir(reposPath, { recursive: true });
    console.log("Created repos directory");
  }
};

// Routes
app.use("/git", gitRouter);
app.use("/claude", claudeRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Function to extract routes from Express app
function getRoutes(app: express.Application): any {
  const routes: any = {};
  
  // Get all routes from the app's router stack
  function extractRoutes(stack: any[], basePath = '') {
    stack.forEach((layer: any) => {
      if (layer.route) {
        // Direct route
        const path = basePath + layer.route.path;
        const methods = Object.keys(layer.route.methods).map(method => method.toUpperCase());
        
        methods.forEach(method => {
          const routeKey = `${method} ${path}`;
          if (!routes[routeKey]) {
            routes[routeKey] = getRouteDescription(method, path);
          }
        });
      } else if (layer.name === 'router' && layer.handle.stack) {
        // Router middleware (like our git and claude routers)
        const routerPath = basePath + (layer.regexp.source.match(/^\^\\?\/?(.*)\\?\$/) || ['', ''])[1].replace(/\\\//g, '/');
        extractRoutes(layer.handle.stack, routerPath);
      }
    });
  }
  
  extractRoutes(app._router.stack);
  return routes;
}

// Function to provide descriptions for routes
function getRouteDescription(method: string, path: string): string {
  const descriptions: { [key: string]: string } = {
    'GET /health': 'Server health check',
    'GET /api': 'API documentation (this endpoint)',
    'GET /git/repos': 'List all local repositories with status',
    'POST /git/init': 'Clone repository from URL',
    'POST /git/save': 'Commit and push changes',
    'GET /git/status/:repo': 'Get repository status, branches, and remotes',
    'POST /git/pull': 'Pull changes from remote',
    'POST /git/branch': 'Create new branch or list branches',
    'POST /git/checkout': 'Switch to existing branch',
    'GET /git/log/:repo': 'Get commit history (optional ?limit parameter)',
    'POST /git/reset': 'Reset repository (soft/mixed/hard modes)',
    'GET /git/diff/:repo': 'Get diff (optional ?staged parameter)',
    'GET /git/repos/:name/files': 'Browse repository file structure',
    'GET /git/repos/:name/files/*': 'Read specific file content from repository',
    'PUT /git/repos/:name/files/*': 'Update specific file content in repository',
    'DELETE /git/repo/:repo': 'Delete local repository',
    'POST /claude/prompt': 'Process Claude AI prompts with optional repository context'
  };
  
  const routeKey = `${method} ${path}`;
  return descriptions[routeKey] || 'No description available';
}

// API documentation endpoint with automatic route discovery
app.get("/api", (req, res) => {
  const routes = getRoutes(app);
  
  // Group routes by category
  const groupedRoutes: any = {
    system: {},
    git: {},
    claude: {}
  };
  
  Object.entries(routes).forEach(([route, description]) => {
    if (route.includes('/git/')) {
      groupedRoutes.git[route] = description;
    } else if (route.includes('/claude/')) {
      groupedRoutes.claude[route] = description;
    } else {
      groupedRoutes.system[route] = description;
    }
  });
  
  res.json({
    title: "Claude Remote Development API",
    version: "1.0.0",
    description: "HTTP API for remote Git repository management and Claude AI integration",
    discoveredAt: new Date().toISOString(),
    totalRoutes: Object.keys(routes).length,
    endpoints: groupedRoutes,
    usage: {
      repository_parameter: "Repository parameter can be either a repository name (for local repos) or a full Git URL",
      authentication: "No authentication required for this development server",
      cors: "CORS enabled for cross-origin requests",
      note: "Routes are automatically discovered from the Express application"
    }
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
);

const startServer = async () => {
  try {
    await ensureReposDirectory();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(
        `📁 Repos will be cloned to: ${path.join(process.cwd(), "repos")}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
