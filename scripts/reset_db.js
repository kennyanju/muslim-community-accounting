import { DatabaseController } from '../src/lib/db.js';

console.log("--------------------------------------------------");
console.log("RESETTING MASJID ACCOUNTING DATABASE TO FRESH STATE");
console.log("--------------------------------------------------");

try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.resetDatabase(true);
  console.log("✅ Database reset successfully!");
  console.log("   - Transactions & splits: Cleared (0 records)");
  console.log("   - Donors: Cleared (Anonymous profile ready)");
  console.log("   - Funds: 7 standard Islamic fund wallets initialized");
  console.log("   - Users: Admin accounts preserved");
  console.log("--------------------------------------------------");
} catch (err) {
  console.error("❌ Failed to reset database:", err.message);
  process.exit(1);
}
