import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import { randomUUID } from "crypto";

export interface ClaudePromptRequest {
  prompt: string;
  repo?: string;
  continue?: boolean;
  sessionId?: string;
}

export interface ClaudeResponse {
  message: string;
  timestamp: string;
  promptLength: number;
  response: SDKMessage[];
  workingDirectory: string;
  messages: number;
  sessionId?: string;
}

export interface ClaudeSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  repoContext?: string;
  workingDirectory: string;
  messages: SDKMessage[];
  metadata: {
    totalPrompts: number;
    lastPrompt?: string;
  };
}

export interface CreateSessionRequest {
  repo?: string;
  metadata?: Record<string, any>;
}

export interface SessionResponse {
  session: ClaudeSession;
  message: string;
}

const MAX_TURNS = 20;
const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "Glob",
  "Grep",
  "LS",
  "Git",
];
const PERMISSION_MODE = "acceptEdits" as const;

// In-memory session storage
const sessions = new Map<string, ClaudeSession>();

export async function processPrompt(
  request: ClaudePromptRequest,
  workingDirectory: string
): Promise<ClaudeResponse> {
  const { prompt, continue: continuePrompt, sessionId } = request;

  console.log("Processing Claude prompt:", prompt);

  let session: ClaudeSession | undefined;

  // If sessionId is provided, use session context
  if (sessionId) {
    session = sessions.get(sessionId);
    if (session) {
      workingDirectory = session.workingDirectory;
      console.log(`Using session ${sessionId} with working directory: ${workingDirectory}`);
    } else {
      console.warn(`Session ${sessionId} not found, proceeding without session context`);
    }
  }

  const messages: SDKMessage[] = [];

  for await (const message of query({
    prompt: prompt,
    abortController: new AbortController(),
    options: {
      maxTurns: MAX_TURNS,
      cwd: workingDirectory,
      allowedTools: ALLOWED_TOOLS,
      permissionMode: PERMISSION_MODE,
      continue: continuePrompt,
    },
  })) {
    messages.push(message);
  }

  // Update session if one was used
  if (session && sessionId) {
    session.messages.push(...messages);
    session.updatedAt = new Date().toISOString();
    session.metadata.totalPrompts += 1;
    session.metadata.lastPrompt = prompt;
    sessions.set(sessionId, session);
  }

  return {
    message: "Prompt processed successfully",
    timestamp: new Date().toISOString(),
    promptLength: prompt.length,
    response: messages,
    workingDirectory,
    messages: messages.length,
    sessionId,
  };
}

export function createSession(
  workingDirectory: string,
  repoContext?: string
): ClaudeSession {
  const id = randomUUID();
  const now = new Date().toISOString();
  
  const session: ClaudeSession = {
    id,
    createdAt: now,
    updatedAt: now,
    repoContext,
    workingDirectory,
    messages: [],
    metadata: {
      totalPrompts: 0,
    },
  };

  sessions.set(id, session);
  console.log(`Created new session: ${id}`);
  
  return session;
}

export function getSession(sessionId: string): ClaudeSession | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): boolean {
  const deleted = sessions.delete(sessionId);
  if (deleted) {
    console.log(`Deleted session: ${sessionId}`);
  }
  return deleted;
}

export function getAllSessions(): ClaudeSession[] {
  return Array.from(sessions.values());
}

export function getSessionCount(): number {
  return sessions.size;
}
