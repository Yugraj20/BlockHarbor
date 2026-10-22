const { Database } = require("bun:sqlite");
const bcrypt = require("bcryptjs");

const newPassword = "admin123";
const newHash = bcrypt.hashSync(newPassword, 10);
console.log(`Setting bcrypt hash for '${newPassword}':`, newHash);

const dbPaths = [
  "C:/Program Files/BlockHarbor/db.sql",
  "../dist/desktop/db.sql",
  "../db.sql"
];

for (const p of dbPaths) {
  try {
    const db = new Database(p);
    const user = db.query("SELECT * FROM users LIMIT 1").get();
    if (user) {
      db.run("UPDATE users SET username = ?, password = ? WHERE id = ?", ["admin", newHash, user.id]);
      console.log("Successfully updated admin in", p);
    }
    const check = db.query("SELECT username, password FROM users LIMIT 1").get();
    const matches = bcrypt.compareSync(newPassword, check.password);
    console.log(`Verified ${p}: username=${check.username}, password match=${matches}`);
    db.close();
  } catch (err) {
    console.warn("Could not update", p, err.message);
  }
}
