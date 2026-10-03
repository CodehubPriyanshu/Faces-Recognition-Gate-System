import { closeDatabase, getDatabase } from "../src/server/database.js";

try {
  const db = await getDatabase();
  await db.command({ ping: 1 });
  console.log("MongoDB connection and application indexes are ready.");
} catch (error) {
  console.error(
    `Database check failed (${error.code || error.name}). Check MONGODB_URI and MongoDB network access.`,
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
