#!/usr/bin/env node

const { runds } = require("../scripts/run");

runDs().catch((error) => {
  console.error("Failed to start ds:", error.message);
  process.exit(1);
});
