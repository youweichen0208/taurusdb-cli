// Re-export everything from subdirectories for backward compatibility with tests
export * from "./types/index.js";
export * from "./constants/index.js";
export * from "./config/index.js";
export * from "./errors/index.js";
export * from "./http/index.js";
export * from "./api/index.js";
export * from "./validation/index.js";
export * from "./output/index.js";
export * from "./llm/index.js";
export * from "./interactive/index.js";
export * from "./cli/index.js";

// CLI entry point exports
export { program, isDirectRun } from "./cli/index.js";