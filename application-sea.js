//=============//
// WRAPPER SEA //
//=============//
// This file is the entry point embedded in the SEA blob
// It loads the real application.js from disk

const path = require('path');
const { createRequire } = require('module');

// Determine the application directory (where the executable is located)
const appDir = path.dirname(process.execPath);

// Create a require that points to the application directory
const requireFromDisk = createRequire(appDir + '/');

// Load and execute the real application.js from disk
// Note: application.js runs directly, no need to export it
requireFromDisk('./application.js');
