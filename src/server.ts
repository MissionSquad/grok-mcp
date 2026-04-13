#!/usr/bin/env node

import { FastMCP } from '@missionsquad/fastmcp'
import { createResources } from './resources.js'
import { routeConsoleStdoutToStderr } from './stdio-safe-console.js'
import { createToolDefinitions } from './tools.js'

routeConsoleStdoutToStderr()

export const server = new FastMCP<undefined>({
  name: 'grok',
  version: '0.3.0',
})

for (const tool of createToolDefinitions()) {
  server.addTool(tool)
}

for (const resource of createResources()) {
  server.addResource(resource)
}

async function main(): Promise<void> {
  await server.start({ transportType: 'stdio' })
}

async function shutdown(exitCode: number): Promise<void> {
  try {
    await server.stop()
  } finally {
    process.exit(exitCode)
  }
}

process.on('SIGINT', () => {
  void shutdown(0)
})

process.on('SIGTERM', () => {
  void shutdown(0)
})

process.on('uncaughtException', () => {
  void shutdown(1)
})

process.on('unhandledRejection', () => {
  void shutdown(1)
})

void main().catch(() => {
  void shutdown(1)
})
