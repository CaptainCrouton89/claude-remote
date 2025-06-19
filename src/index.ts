import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs/promises";
import helmet from "helmet";
import ngrok from "ngrok";
import path from "path";
import { claudeRouter } from "./routes/claude.js";
import { gitRouter } from "./routes/git.js";

const app = express();
const PORT = process.env.PORT || 3950;

// Generate API key
const API_KEY = process.env.API_KEY || crypto.randomBytes(32).toString('hex');
const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';

// Authentication middleware
const authenticateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Skip auth for health and api documentation endpoints
  if (req.path === '/health' || req.path === '/api' || DISABLE_AUTH) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token || token !== API_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Valid API key required. Use Authorization: Bearer <api-key>' 
    });
  }

  next();
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authenticateApiKey);

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
  function extractRoutes(stack: any[], basePath = "") {
    stack.forEach((layer: any) => {
      if (layer.route) {
        // Direct route
        const path = basePath + layer.route.path;
        const methods = Object.keys(layer.route.methods).map((method) =>
          method.toUpperCase()
        );

        methods.forEach((method) => {
          const routeKey = `${method} ${path}`;
          if (!routes[routeKey]) {
            routes[routeKey] = getRouteDescription(method, path);
          }
        });
      } else if (layer.name === "router" && layer.handle.stack) {
        // Router middleware (like our git and claude routers)
        let routerPath = basePath;
        // Extract the mount path from the regex - Express routers have patterns like /^\/git\/?(?=\/|$)/i
        const regexSource = layer.regexp.source;
        const match = regexSource.match(/^\\?\^\\?\\\/(.*?)\\?\\\?/);
        if (match && match[1]) {
          routerPath = basePath + "/" + match[1].replace(/\\\//g, "/");
        }
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
    "GET /health": "Server health check",
    "GET /api": "API documentation (this endpoint)",
    "GET /git/repos": "List all local repositories with status",
    "GET /repos": "List all local repositories with status",
    "POST /git/init": "Clone repository from URL",
    "POST /init": "Clone repository from URL",
    "POST /git/save": "Commit and push changes",
    "POST /save": "Commit and push changes",
    "GET /git/status/:repo": "Get repository status, branches, and remotes",
    "GET /status/:repo": "Get repository status, branches, and remotes",
    "POST /git/pull": "Pull changes from remote",
    "POST /pull": "Pull changes from remote",
    "POST /git/branch": "Create new branch or list branches",
    "POST /branch": "Create new branch or list branches",
    "POST /git/checkout": "Switch to existing branch",
    "POST /checkout": "Switch to existing branch",
    "GET /git/log/:repo": "Get commit history (optional ?limit parameter)",
    "GET /log/:repo": "Get commit history (optional ?limit parameter)",
    "POST /git/reset": "Reset repository (soft/mixed/hard modes)",
    "POST /reset": "Reset repository (soft/mixed/hard modes)",
    "GET /git/diff/:repo": "Get diff (optional ?staged parameter)",
    "GET /diff/:repo": "Get diff (optional ?staged parameter)",
    "GET /git/repos/:name/files": "Browse repository file structure",
    "GET /repos/:name/files": "Browse repository file structure",
    "GET /git/repos/:name/files/*":
      "Read specific file content from repository",
    "GET /repos/:name/files/*": "Read specific file content from repository",
    "PUT /git/repos/:name/files/*":
      "Update specific file content in repository",
    "PUT /repos/:name/files/*": "Update specific file content in repository",
    "DELETE /git/repo/:repo": "Delete local repository",
    "DELETE /repo/:repo": "Delete local repository",
    "POST /claude/prompt":
      "Process Claude AI prompts with optional repository context",
    "POST /prompt":
      "Process Claude AI prompts with optional repository context",
    "GET /claude/sessions": "List all Claude conversation sessions",
    "GET /sessions": "List all Claude conversation sessions",
    "POST /claude/sessions":
      "Create new Claude conversation session with optional repository context",
    "POST /sessions":
      "Create new Claude conversation session with optional repository context",
    "GET /claude/sessions/:id":
      "Get specific Claude session conversation history",
    "GET /sessions/:id": "Get specific Claude session conversation history",
    "DELETE /claude/sessions/:id": "Delete Claude conversation session",
    "DELETE /sessions/:id": "Delete Claude conversation session",
    "POST /claude/sessions/:id/prompt":
      "Send prompt to existing Claude session",
    "POST /sessions/:id/prompt": "Send prompt to existing Claude session",
    "POST /git/merge": "Merge specified branch into current branch",
    "POST /merge": "Merge specified branch into current branch",
    "POST /git/stash": "Stash current changes",
    "POST /stash": "Stash current changes",
    "POST /git/stash/pop": "Apply and remove most recent stash",
    "POST /stash/pop": "Apply and remove most recent stash",
    "GET /git/stash": "List all stashes",
    "GET /stash": "List all stashes",
    "POST /git/tag": "Create a new tag",
    "POST /tag": "Create a new tag",
    "GET /git/tags/:repo": "List all tags in repository",
    "GET /tags/:repo": "List all tags in repository",
    "POST /git/remote": "Add new remote to repository",
    "POST /remote": "Add new remote to repository",
    "GET /git/remotes/:repo": "List all remotes for repository",
    "GET /remotes/:repo": "List all remotes for repository",
  };

  const routeKey = `${method} ${path}`;
  return descriptions[routeKey] || "No description available";
}

// API documentation endpoint with automatic route discovery
app.get("/api", (req, res) => {
  const routes = getRoutes(app);

  // Group routes by category
  const groupedRoutes: any = {
    system: {},
    git: {},
    claude: {},
  };

  Object.entries(routes).forEach(([route, description]) => {
    if (
      route.includes("/git/") ||
      ((route.includes("/repos") ||
        route.includes("/init") ||
        route.includes("/save") ||
        route.includes("/pull") ||
        route.includes("/branch") ||
        route.includes("/checkout") ||
        route.includes("/log") ||
        route.includes("/reset") ||
        route.includes("/diff") ||
        route.includes("/merge") ||
        route.includes("/stash") ||
        route.includes("/tag") ||
        route.includes("/remote")) &&
        !route.includes("/claude/"))
    ) {
      groupedRoutes.git[route] = description;
    } else if (
      route.includes("/claude/") ||
      ((route.includes("/prompt") || route.includes("/sessions")) &&
        !route.includes("/git/"))
    ) {
      groupedRoutes.claude[route] = description;
    } else {
      groupedRoutes.system[route] = description;
    }
  });

  res.json({
    title: "Claude Remote Development API",
    version: "1.0.0",
    description:
      "HTTP API for remote Git repository management and Claude AI integration",
    discoveredAt: new Date().toISOString(),
    totalRoutes: Object.keys(routes).length,
    endpoints: groupedRoutes,
    usage: {
      repository_parameter:
        "Repository parameter can be either a repository name (for local repos) or a full Git URL",
      authentication: "No authentication required for this development server",
      cors: "CORS enabled for cross-origin requests",
      note: "Routes are automatically discovered from the Express application",
    },
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

    const server = app.listen(PORT, async () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📁 Repos will be cloned to: ${path.join(process.cwd(), "repos")}`);
      
      // Start ngrok tunnel
      try {
        const ngrokAuthToken = process.env.NGROK_AUTH_TOKEN;
        const ngrokOptions: any = { addr: PORT };
        
        if (ngrokAuthToken) {
          ngrokOptions.authtoken = ngrokAuthToken;
        }
        
        const publicUrl = await ngrok.connect(ngrokOptions);
        console.log('');
        console.log('🌐 PUBLIC ACCESS:');
        console.log(`   URL: ${publicUrl}`);
        console.log(`   API Key: ${API_KEY}`);
        console.log('');
        console.log('📱 For mobile access, use:');
        console.log(`   Authorization: Bearer ${API_KEY}`);
        console.log('');
      } catch (ngrokError) {
        console.error('❌ Failed to start ngrok tunnel:', ngrokError);
        console.log('💡 Server still accessible locally at:', `http://localhost:${PORT}`);
        console.log(`   API Key: ${API_KEY}`);
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('🛑 Shutting down gracefully...');
      await ngrok.disconnect();
      await ngrok.kill();
      server.close();
    });

    process.on('SIGINT', async () => {
      console.log('🛑 Shutting down gracefully...');
      await ngrok.disconnect();
      await ngrok.kill();
      server.close();
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
