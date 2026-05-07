#!/usr/bin/env node

const { rundsTui } = require("../scripts/run");

rundsTui().catch((error) => {
  console.error("Failed to start DS-Code:", error.message);
  process.exit(1);
});
