import { randomUUID } from "node:crypto";
import { closeDatabase, getDatabase } from "../src/server/database.js";
import { hashPassword, userSchema } from "../src/server/security.js";

// Re-running never resets an account or promotes an existing non-admin.
try {
  const input = userSchema.parse({
    email: process.env.ADMIN_EMAIL,
    full_name: process.env.ADMIN_NAME,
    password: process.env.ADMIN_PASSWORD,
    role: "admin",
  });
  const db = await getDatabase();
  const existing = await db.collection("users").findOne({ email: input.email });
  if (existing) {
    if (existing.role !== "admin") throw new Error("Existing account is not an administrator");
    console.log("Administrator already exists; no credentials changed.");
  } else {
    await db.collection("users").insertOne({
      _id: randomUUID(),
      email: input.email,
      full_name: input.full_name,
      role: input.role,
      password_hash: await hashPassword(input.password),
      auth_version: 0,
      created_at: new Date().toISOString(),
    });
    console.log("Initial administrator created.");
  }
} catch (error) {
  console.error(
    `Administrator seed failed (${error.name}). Check ADMIN_* values, account role, and MongoDB access.`,
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
