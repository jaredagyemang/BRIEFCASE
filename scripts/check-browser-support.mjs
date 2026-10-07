// Runs after `next build` (npm run build): checks the files sent to browsers
// still work on the oldest browsers Briefcase supports, Safari / iOS / iPadOS
// 15.4 (the browserslist in package.json). Fails the build if not, so a
// Next.js, React or Tailwind upgrade can't quietly break older iPads.
//
// Why: Safari refuses a whole JavaScript file with syntax it doesn't know, and
// then the app never starts (buttons do nothing; only plain links work). That
// happened with Next.js's own code until Safari 15.4 was added to the targets.
import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";

const root = path.resolve(import.meta.dirname, "..");
// Another build folder can be given (for testing the check itself).
const staticDir = path.resolve(process.argv[2] ?? path.join(root, ".next"), "static");
if (!fs.existsSync(staticDir)) {
  console.error("check-browser-support: no .next/static, run `next build` first.");
  process.exit(1);
}
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(staticDir);
const problems = [];
const rel = (f) => path.relative(root, f);
const near = (code, i) => JSON.stringify(code.slice(Math.max(0, i - 40), i + 60));

// --- JavaScript: syntax Safari 15.4 can't parse -------------------------------
function walkAst(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key in node) {
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walkAst(c, visit);
    else if (v && typeof v === "object" && typeof v.type === "string") walkAst(v, visit);
  }
}
const regexProblem = (pattern, flags) => {
  if (/\(\?<[=!]/.test(pattern)) return "a regex lookbehind (?<= or (?<! (Safari 16.4)";
  if (flags.includes("v")) return "a regex v flag (Safari 17)";
  if (/\(\?[ims-]+:/.test(pattern)) return "a regex modifier (?i:…) (Safari 18.4)";
  const groups = [...pattern.matchAll(/\(\?<([A-Za-z_$][\w$]*)>/g)].map((m) => m[1]);
  if (new Set(groups).size !== groups.length) return "duplicate named regex groups (Safari 17)";
  return null;
};
for (const file of files.filter((f) => f.endsWith(".js"))) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true, allowReturnOutsideFunction: true });
  } catch {
    try {
      ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
    } catch (error) {
      problems.push(`${rel(file)}: can't be parsed (${error.message})`);
      continue;
    }
  }
  walkAst(ast, (n) => {
    if (n.type === "StaticBlock") problems.push(`${rel(file)}: a class static block \`static {…}\` (Safari 16.4) near ${near(code, n.start)}`);
    if ((n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.attributes?.length)
      problems.push(`${rel(file)}: import attributes \`with {…}\` (Safari 17.2) near ${near(code, n.start)}`);
    if (n.type === "ImportExpression" && n.options) problems.push(`${rel(file)}: import() options (Safari 17.2) near ${near(code, n.start)}`);
    if (n.type === "VariableDeclaration" && (n.kind === "using" || n.kind === "await using"))
      problems.push(`${rel(file)}: a \`using\` declaration (not in Safari) near ${near(code, n.start)}`);
    if (n.type === "Literal" && n.regex) {
      const p = regexProblem(n.regex.pattern, n.regex.flags);
      if (p) problems.push(`${rel(file)}: ${p} near ${near(code, n.start)}`);
    }
    // new RegExp("…") with a fixed pattern throws when it runs.
    if ((n.type === "NewExpression" || n.type === "CallExpression") && n.callee?.name === "RegExp" && n.arguments[0]?.type === "Literal" && typeof n.arguments[0].value === "string") {
      const flags = n.arguments[1]?.type === "Literal" ? String(n.arguments[1].value) : "";
      const p = regexProblem(n.arguments[0].value, flags);
      if (p) problems.push(`${rel(file)}: ${p} in RegExp(…) near ${near(code, n.start)}`);
    }
  });
}

// --- CSS ---------------------------------------------------------------------------
const tintFallbacks = fs.readFileSync(path.join(root, "src/app/tint-fallbacks.css"), "utf8");
const covered = new Set([...tintFallbacks.matchAll(/^\s*\.((?:\\.|[\w-])+)\s*\{/gm)].map((m) => m[1]));
for (const file of files.filter((f) => f.endsWith(".css"))) {
  const css = fs.readFileSync(file, "utf8");
  // light-dark() is turned into variables for older browsers; if any is left,
  // that stopped happening and colours would be missing before Safari 17.5.
  if (css.includes("light-dark(")) problems.push(`${rel(file)}: light-dark() wasn't converted for older browsers`);
  // A tint of one of the app's colour tokens (e.g. bg-red/10) needs a
  // fallback, or it turns solid without color-mix().
  for (const block of css.matchAll(/@supports \(color:\s?color-mix\(in lab,\s?red,\s?red\)\)\s?\{/g)) {
    const start = block.index + block[0].length;
    let depth = 1, i = start;
    while (depth && i < css.length) {
      depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
      i++;
    }
    for (const rule of css.slice(start, i - 1).matchAll(/([^{}]+)\{([^{}]*color-mix\(in oklab,\s?var\(--(?!color-|tw-)[a-z-]+\)[^{}]*)\}/g)) {
      for (const selector of rule[1].split(",")) {
        const cls = selector.trim().match(/^\.((?:\\.|[\w-])+)/)?.[1];
        if (cls && !covered.has(cls)) problems.push(`${rel(file)}: the tint .${cls.replace(/\\/g, "")} has no fallback for older Safari. Run \`npm run tint-fallbacks\`.`);
      }
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`\n✖ check-browser-support: ${unique.length} problem(s) for Safari / iOS / iPadOS 15.4:\n`);
  for (const p of unique.slice(0, 40)) console.error(`  - ${p}`);
  console.error(
    "\nSafari refuses a whole script with syntax it doesn't know, so the app wouldn't start on older iPads." +
      "\nCheck the \"browserslist\" in package.json still lists safari 15.4 and ios_saf 15.4, or decide to stop supporting them.\n",
  );
  process.exit(1);
}
console.log(`✓ check-browser-support: ${files.filter((f) => f.endsWith(".js")).length} scripts and the styles work on Safari / iOS / iPadOS 15.4`);
