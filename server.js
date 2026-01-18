const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ---- Google credentials ----
const credsRaw = process.env.GOOGLE_CREDENTIALS;
if (!credsRaw) {
  // local fallback only
  if (fs.existsSync(path.join(__dirname, "credentials.json"))) {
    credsRaw = fs.readFileSync(path.join(__dirname, "credentials.json"), "utf8");
  } else {
    throw new Error("Missing GOOGLE_CREDENTIALS env var (and no local credentials.json found).");
  }
}


const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credsRaw),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ---- Serve static files ----
app.use(express.static(__dirname));

// ---- Helpers ----
function rowsToObjects(values) {
  if (!values || !values.length) return [];
  const header = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = row[i] ?? ""));
    return obj;
  });
}

async function readTab(tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:Z`,
  });
  return res.data.values || [];
}

// ---- API ROUTES ----
app.get("/api/dashboard", async (_, res) => {
  try {
    res.json(rowsToObjects(await readTab("Dashboard")));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/members", async (_, res) => {
  res.json(rowsToObjects(await readTab("Members")));
});

app.get("/api/books", async (_, res) => {
  res.json(rowsToObjects(await readTab("Books")));
});

app.get("/api/checkpoint-status", async (_, res) => {
  res.json(rowsToObjects(await readTab("CheckpointStatus")));
});

app.post("/api/checkpoint-status/save", async (req, res) => {
  res.json({ ok: true });
});

// 🚨 ONLY listen locally
if (require.main === module) {
  app.listen(3000, () => console.log("Local server on http://localhost:3000"));
}

module.exports = app;




