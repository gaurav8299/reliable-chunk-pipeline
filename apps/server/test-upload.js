/**
 * Test Script — Sends a dummy chunk upload and verifies the response.
 *
 * Usage:
 *   node test-upload.js
 */

import { randomUUID, createHash } from "node:crypto";

const SERVER_URL = "http://localhost:3000";

function sha256(data) {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

async function testUpload() {
  const chunkId = randomUUID();
  const data = "test chunk data — " + new Date().toISOString();
  const checksum = sha256(data);

  console.log("=== Chunk Upload Test ===");
  console.log(`  chunkId:  ${chunkId}`);
  console.log(`  data:     ${data}`);
  console.log(`  checksum: ${checksum}`);
  console.log("");

  // --- Test 1: Upload a valid chunk ---
  console.log("1️⃣  Uploading valid chunk...");
  try {
    const res = await fetch(`${SERVER_URL}/api/chunks/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunkId, data, checksum }),
    });
    const json = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(json, null, 2));
    console.log("");
  } catch (err) {
    console.error("   ❌ Upload failed:", err.message);
    process.exit(1);
  }

  // --- Test 2: Upload with bad checksum ---
  console.log("2️⃣  Uploading chunk with bad checksum (should fail)...");
  try {
    const res = await fetch(`${SERVER_URL}/api/chunks/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chunkId: randomUUID(),
        data: "some data",
        checksum: "deadbeef",
      }),
    });
    const json = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(json, null, 2));
    console.log("");
  } catch (err) {
    console.error("   ❌ Request failed:", err.message);
  }

  // --- Test 3: Upload without chunkId (should fail) ---
  console.log("3️⃣  Uploading without chunkId (should fail)...");
  try {
    const res = await fetch(`${SERVER_URL}/api/chunks/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "missing id" }),
    });
    const json = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(json, null, 2));
    console.log("");
  } catch (err) {
    console.error("   ❌ Request failed:", err.message);
  }

  // --- Test 4: List all chunks ---
  console.log("4️⃣  Listing all chunks...");
  try {
    const res = await fetch(`${SERVER_URL}/api/chunks`);
    const json = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(json, null, 2));
    console.log("");
  } catch (err) {
    console.error("   ❌ Request failed:", err.message);
  }

  // --- Test 5: Get specific chunk ---
  console.log(`5️⃣  Getting chunk ${chunkId}...`);
  try {
    const res = await fetch(`${SERVER_URL}/api/chunks/${chunkId}`);
    const json = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(json, null, 2));
    console.log("");
  } catch (err) {
    console.error("   ❌ Request failed:", err.message);
  }

  console.log("=== All tests completed ===");
}

testUpload();
