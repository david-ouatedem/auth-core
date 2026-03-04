#!/usr/bin/env node

import { main } from './prompts.js'

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
