const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "frontend", "out");
const vfsFile = path.join(rootDir, "shared", "vfs.js");

function listFilesRecursively(dir) {
  const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of dirEntries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursively(entryPath));
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }
  return result;
}

if (!fs.existsSync(outDir)) {
  console.error("Error: frontend/out does not exist. Run 'next build' in frontend first.");
  process.exit(1);
}

const files = listFilesRecursively(outDir);
console.log(`Encoding ${files.length} static frontend files into VFS...`);

const rows = files.map((absolutePath) => {
  const relativePath = path
    .relative(outDir, absolutePath)
    .split(path.sep)
    .join("/");
  const encoded = fs.readFileSync(absolutePath).toString("base64");
  return `  ${JSON.stringify(relativePath)}: ${JSON.stringify(encoded)},`;
});

const output = `export default {\n${rows.join("\n")}\n};\n`;
fs.writeFileSync(vfsFile, output, "utf-8");
console.log(`Successfully generated ${vfsFile} (${(output.length / 1024 / 1024).toFixed(2)} MB)`);
