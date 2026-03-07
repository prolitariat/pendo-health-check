const fs = require("fs");
const source = fs.readFileSync("popup.js", "utf-8");

// Find function boundaries using a proper parser that handles
// strings, template literals, regexes, and comments
function extractFunction(source, funcName) {
  const startPattern = "function " + funcName + "()";
  const startIdx = source.indexOf(startPattern);
  if (startIdx === -1) throw new Error("Could not find " + funcName);

  let depth = 0;
  let i = source.indexOf("{", startIdx);

  while (i < source.length) {
    const ch = source[i];

    // Skip single-line comments
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
      i++;
      continue;
    }

    // Skip multi-line comments
    if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }

    // Skip strings (double quote)
    if (ch === '"') {
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") i++; // skip escaped char
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    // Skip strings (single quote)
    if (ch === "'") {
      i++;
      while (i < source.length && source[i] !== "'") {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }

    // Skip template literals (backtick) — handles nested ${}
    if (ch === "`") {
      i++;
      let tmplDepth = 0;
      while (i < source.length) {
        if (source[i] === "\\" ) { i += 2; continue; }
        if (source[i] === "`" && tmplDepth === 0) { i++; break; }
        if (source[i] === "$" && source[i + 1] === "{") { tmplDepth++; i += 2; continue; }
        if (source[i] === "}" && tmplDepth > 0) { tmplDepth--; i++; continue; }
        i++;
      }
      continue;
    }

    // Skip regex literals (heuristic: / after certain tokens)
    if (ch === "/") {
      // Check if this could be a regex by looking at what came before
      const before = source.substring(Math.max(0, i - 20), i).trimEnd();
      const lastChar = before[before.length - 1];
      const regexPrecedes = "=(!&|:;,?[{(+-~*/%<>^";
      if (regexPrecedes.includes(lastChar) || before.endsWith("return") || before.endsWith("typeof") || before.endsWith("in") || before.endsWith("case")) {
        i++; // skip opening /
        while (i < source.length && source[i] !== "/") {
          if (source[i] === "\\") i++;
          if (source[i] === "\n") break; // regex can't span lines
          i++;
        }
        i++; // skip closing /
        // skip flags
        while (i < source.length && /[gimsuy]/.test(source[i])) i++;
        continue;
      }
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.substring(startIdx, i + 1);
    }
    i++;
  }
  throw new Error("No closing brace for " + funcName);
}

try {
  const hc = extractFunction(source, "runPendoHealthCheck");
  console.log("runPendoHealthCheck: " + hc.length + " chars (lines ~" + hc.split("\n").length + ")");

  const sa = extractFunction(source, "runPendoSetupAssistant");
  console.log("runPendoSetupAssistant: " + sa.length + " chars (lines ~" + sa.split("\n").length + ")");

  console.log("\n✓ Function extraction works");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
