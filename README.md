# Claude Remote Server

A modern TypeScript Node.js server with git repository management and Claude prompt handling capabilities.

## Features

- **Git Repository Management**: Clone repositories from URLs
- **Claude Prompt Processing**: Accept and log prompts
- **Modern TypeScript**: Built with strict TypeScript configuration
- **Express.js**: RESTful API with proper error handling
- **Security**: Helmet and CORS middleware included

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Health Check

- **GET** `/health`
- Returns server status and timestamp

### Git Repository Management

- **POST** `/git/init`
- Clones a git repository to the `/repos` directory
- **Request Body:**
  ```json
  {
    "url": "https://github.com/username/repository.git"
  }
  ```
- **Response:**
  ```json
  {
    "message": "Repository cloned successfully",
    "repoName": "repository",
    "path": "/path/to/repos/repository",
    "url": "https://github.com/username/repository.git"
  }
  ```

### Claude Prompt Processing

- **POST** `/claude/prompt`
- Accepts and logs prompts for processing
- **Request Body:**
  ```json
  {
    "prompt": "Your prompt text here"
  }
  ```
- **Response:**
  ```json
  {
    "message": "Prompt received and logged",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "promptLength": 20
  }
  ```

## Project Structure

```
├── src/
│   ├── index.ts          # Main server file
│   └── routes/
│       ├── git.ts        # Git-related endpoints
│       └── claude.ts     # Claude-related endpoints
├── repos/                # Cloned repositories (auto-created)
├── dist/                 # Compiled JavaScript (auto-generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run type-check` - Check TypeScript types without compilation

## Environment Variables

- `PORT` - Server port (default: 3000)

## Error Handling

The server includes comprehensive error handling:

- Input validation for all endpoints
- Proper HTTP status codes
- Detailed error messages
- Repository conflict detection (prevents duplicate clones)

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Input Validation**: URL format validation for git endpoints
- **Error Sanitization**: Safe error message exposure
