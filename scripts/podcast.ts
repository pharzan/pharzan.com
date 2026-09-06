#!/usr/bin/env -S pnpm exec tsx

import { main } from "./podcast/cli.ts";

if (import.meta.url === `file://${process.argv[1]}`) await main();
