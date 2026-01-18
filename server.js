const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");


const app = express();
app.use(express.json());

// --- Google auth + Sheets client ---
const credsRaw =
  process.env.GOOGLE_CREDENTIALS ||
  fs.readFileSync(path.join(__dirname, "credentials.json"), "utf8");

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credsRaw),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});



const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;


// --- Serve your HTML files in this folder (index.html) ---
app.use(express.static(__dirname));

// --- Helpers ---
function rowsToObjects(values) {
  const rows = values || [];
  if (rows.length === 0) return [];

  const header = rows[0];
  const data = rows.slice(1);

  return data.map(row => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

async function readTab(tabName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:Z`
  });
  return result.data.values || [];
}

// --- Routes (API endpoints) ---
app.get("/books", async (req, res) => {
  try {
    const values = await readTab("Books");
    res.json(rowsToObjects(values));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/members", async (req, res) => {
  try {
    const values = await readTab("Members");
    res.json(rowsToObjects(values));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/checkpoints", async (req, res) => {
  try {
    const values = await readTab("Checkpoints");
    res.json(rowsToObjects(values));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/checkpoint-status", async (req, res) => {
  try {
    const values = await readTab("CheckpointStatus");
    res.json(rowsToObjects(values));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/dashboard", async (req, res) => {
  try {
    const values = await readTab("Dashboard");
    res.json(rowsToObjects(values));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

//                                          --- Saving button flow ---
app.post("/checkpoint-status/save", async (req, res) => {
  try {
    const { checkpointId, updates } = req.body;

    if (!checkpointId || !Array.isArray(updates)) {
      return res.status(400).json({ error: "Missing checkpointId or updates" });
    }

    // Read existing CheckpointStatus
    const values = await readTab("CheckpointStatus");
    if (!values.length) return res.status(500).json({ error: "CheckpointStatus sheet is empty" });

    const header = values[0];
    const data = values.slice(1);

    // Figure out column positions (safer than hardcoding)
    const colCheckpoint = header.indexOf("CheckPointID");
    const colMember = header.indexOf("MemberID");
    const colCompletion = header.indexOf("CompletionStatus");
    const colUpdatedDate = header.indexOf("UpdatedDate");

    if ([colCheckpoint, colMember, colCompletion, colUpdatedDate].some(i => i === -1)) {
      return res.status(500).json({ error: "CheckpointStatus headers must include CheckPointID, MemberID, CompletionStatus, UpdatedDate" });
    }

    // Map existing rows: "CP001|M001" -> sheetRowNumber (1-based)
    // Row 1 is header, so data row i is sheet row (i + 2)
    const rowMap = new Map();
    data.forEach((row, i) => {
      const cp = row[colCheckpoint] || "";
      const mem = row[colMember] || "";
      rowMap.set(`${cp}|${mem}`, i + 2);
    });

    // Build batch updates for existing rows, and collect new rows to append
    const batchData = [];
    const appendRows = [];

    for (const u of updates) {
      const memberId = u.memberId;
      const completionStatus = (u.completionStatus || "NO").toUpperCase() === "YES" ? "YES" : "NO";
      const updatedDate = completionStatus === "YES" ? (u.updatedDate || "") : "";

      const key = `${checkpointId}|${memberId}`;
      const sheetRow = rowMap.get(key);

      if (sheetRow) {
        // Update CompletionStatus + UpdatedDate (columns C and D in your sheet)
        // But we’ll compute the A1 range based on column indexes:
        const completionColLetter = String.fromCharCode("A".charCodeAt(0) + colCompletion);
        const updatedColLetter = String.fromCharCode("A".charCodeAt(0) + colUpdatedDate);

        batchData.push({
          range: `CheckpointStatus!${completionColLetter}${sheetRow}:${updatedColLetter}${sheetRow}`,
          values: [[completionStatus, updatedDate]]
        });
      } else {
        // Append a new row with required columns
        // Create a full row array matching headers length
        const newRow = Array(header.length).fill("");
        newRow[colCheckpoint] = checkpointId;
        newRow[colMember] = memberId;
        newRow[colCompletion] = completionStatus;
        newRow[colUpdatedDate] = updatedDate;
        appendRows.push(newRow);
      }
    }

    // Apply batch updates (existing rows)
    if (batchData.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: batchData
        }
      });
    }

    // Append new rows if needed
    if (appendRows.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "CheckpointStatus!A:Z",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: appendRows }
      });
    }

    res.json({ ok: true, updated: batchData.length, added: appendRows.length });

  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});


// --- Start server ---
if (require.main === module) {
  app.listen(3000, () => console.log("Server running on http://localhost:3000"));
}

module.exports = app;




