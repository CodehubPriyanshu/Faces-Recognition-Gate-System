import { MongoClient } from "mongodb";

let connection;
let client;

export async function getDatabase() {
  if (!connection) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Set MONGODB_URI in .env before starting the application.");
    client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
    connection = client
      .connect()
      .then(async () => {
        const db = client.db(process.env.MONGODB_DB_NAME || "vigil_guardian_pass");
        await Promise.all([
          db.collection("users").createIndex({ email: 1 }, { unique: true }),
          db.collection("sessions").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
          db.collection("sessions").createIndex({ user_id: 1 }),
          db.collection("login_attempts").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
          db.collection("visitors").createIndex({ pass_no: 1 }, { unique: true }),
          db.collection("visitors").createIndex({ entry_time: -1 }),
          db.collection("visitors").createIndex({ status: 1, exit_time: 1 }),
          db.collection("audit_logs").createIndex({ ts: -1 }),
        ]);
        return db;
      })
      .catch(async (error) => {
        connection = undefined;
        await client.close();
        throw error;
      });
  }
  return connection;
}

export async function closeDatabase() {
  await client?.close();
  connection = undefined;
  client = undefined;
}
