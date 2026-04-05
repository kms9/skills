#!/usr/bin/env node
import { runCli } from './cliApp.js'
import { fail } from './cli/ui.js'
import { CLAWHUB_BRAND } from './runtime.js'

void runCli(CLAWHUB_BRAND, process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  fail(message)
})
