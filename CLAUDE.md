# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Common Development Tasks

- `npm run dev` - Start development server with hot reload on port 3950
- `npm run build` - Compile TypeScript to JavaScript in `dist/`
- `npm start` - Run production server from compiled code
- `npm run type-check` - Type check without compilation

### Docker Commands

- `docker compose up` - Run server in container (port 3950)
- `docker build -t claude-remote .` - Build container image

## Code Architecture

### Application Structure

This is a TypeScript Node.js REST API server that bridges Git repository management with Claude AI capabilities. The server acts as a middleware service that can clone repositories and process prompts using the Claude Code SDK.

### Key Architecture Components

**Service Layer Pattern**: Business logic is separated into service modules:

- `services/gitService.ts` - Git operations (clone, commit, push)
- `services/claudeService.ts` - Claude prompt processing with repository context

**Route Organization**: API endpoints organized by functionality:

- `/git/*` routes in `routes/git.ts` - Repository management
- `/claude/*` routes in `routes/claude.ts` - AI prompt processing
- `/health` - Server status endpoint

**Repository Management**:

- Repositories are cloned to `./repos/` directory
- Each repository gets its own subdirectory based on the repo name
- Duplicate prevention checks existing repositories before cloning

### Claude Integration Details

The Claude service uses the `@anthropic-ai/claude-code` SDK with these configurations:

- Tools: File operations, bash execution, search capabilities
- Context: Can operate within cloned repository directories
- Multi-turn: Supports up to 20 conversation turns per prompt session

### API Endpoints

**POST /git/init** - Clone repository from URL

- Validates HTTPS/SSH Git URLs
- Creates repository in `repos/` directory
- Prevents duplicate clones

**POST /git/save** - Commit and push changes

- Stages all changes in repository
- Creates commit with provided message
- Pushes to remote origin

**POST /claude/prompt** - Process Claude prompts

- Optional `repoName` parameter for repository context
- Uses Claude Code SDK with full tool permissions
- Returns conversation results and any errors

## Important Configuration Notes

### TypeScript Configuration

- Strict mode enabled with additional safety checks
- ES2022 target with CommonJS modules (required for dependency compatibility)
- Source maps and declarations generated for debugging

### Security Middleware

- Helmet for security headers
- CORS enabled for cross-origin requests
- Input validation on all endpoints

## Repository Context

When working with the Claude integration, remember that:

- Repository context is provided via the `repoName` parameter
- The service changes working directory to the repository before processing
- Git operations are performed within the repository context
- File operations through Claude tools operate within the repository directory
