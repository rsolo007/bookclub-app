// --- Grab elements from the page ---
//--Next member Info ---
      let nextMemberValue = document.getElementById("nextMemberValue");
      let nextBookValue = document.getElementById("nextBookValue")
//--Book Information ---
      let bookTitleValue = document.getElementById("bookTitleValue");
      let bookAuthorValue = document.getElementById("bookAuthorValue");
      let bookSuggestionMemberValue = document.getElementById("bookSuggestionMemberValue");
//--Check Point information ---
      let checkpointValue = document.getElementById("checkpointValue");
      let chaptersValue1 = document.getElementById("chaptersValue1");
      let chaptersValue2 = document.getElementById("chaptersValue2");
      let dueValue = document.getElementById("dueValue");
//-- Member status information
      let memberStatusValue = document.getElementById("memberStatusValue");
      const saveChangesBtn = document.getElementById("saveChangesBtn");

      // We'll store all books here after loading them once
      let dashboardData = [];
      let books = [];
      let members = [];

      let currentCheckpointId = "";


      // Load Dashboard ONCE and fill the top section
      async function loadDashboard() {
        try {
          const res = await fetch("/api/dashboard");
          if (!res.ok) throw new Error(await res.text());
          dashboardData = await res.json();

          const currentRow = dashboardData.find(r => String(r.OrderStatus).toLowerCase() === "current");
          const nextRow = dashboardData.find(r => String(r.OrderStatus).toLowerCase() === "next");

          if (nextRow) {
            nextMemberValue.textContent = nextRow.CompleteName || "";
            nextBookValue.textContent = nextRow.BookTitle || "";
          }

          if (currentRow) {
            bookTitleValue.textContent = currentRow.BookTitle || "";
            bookAuthorValue.textContent = currentRow.AuthorName || "";
            bookSuggestionMemberValue.textContent = currentRow.CompleteName || "";

            checkpointValue.textContent = currentRow.CheckPointNumber || "";
            chaptersValue1.textContent = currentRow.StartingChapter || "";
            chaptersValue2.textContent = currentRow.EndingChapter || "";
            dueValue.textContent = currentRow.DueDate || "";
          }

        } catch (err) {
          console.error(err);
          document.getElementById("error").textContent = "Error loading Dashboard";
        }
      }


      // Render-only member status table
async function loadMemberStatusTable() {
  const tbody = document.getElementById("memberStatusBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  try {
    // Ensure dashboard is loaded (so we can get current checkpoint)
    if (dashboardData.length === 0) {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(await res.text());
      dashboardData = await res.json();
      //console.log(JSON.stringify(dashboardData));
    }
    
    // Get JSON row where status is current
    const currentRow = dashboardData.find(r => String(r.OrderStatus).toLowerCase() === "current") || dashboardData[0];

    // Get the checkpoint ID
    currentCheckpointId =
      currentRow?.CheckPointID ||
      "";  
    if (!currentCheckpointId) {
      tbody.innerHTML = `<tr><td colspan="3">No current checkpoint found on Dashboard.</td></tr>`;
      return;
    }

    // Load members (memberRes) + checkpoint status (csRes)
    const [membersRes, csRes] = await Promise.all([
      fetch("/api/members"),
      fetch("/api/checkpoint-status")
    ]);
    console.log(JSON.stringify(membersRes))

    if (!membersRes.ok) throw new Error(await membersRes.text());
    if (!csRes.ok) throw new Error(await csRes.text());

    const members = await membersRes.json();
    const checkpointStatus = await csRes.json();

    // Build lookup for this checkpoint: MemberID -> row
    const statusByMember = new Map();
    checkpointStatus
      .filter(r => r.CheckPointID === currentCheckpointId)
      .forEach(r => statusByMember.set(r.MemberID, r));

    // Active members only
    const activeMembers = members.filter(m => String(m.Status).toLowerCase() === "active");

    function formatTodayMDY() {
      const d = new Date();
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }

    // Render
    activeMembers.forEach(m => {
      const memberId = m.MemberID;

      const fullName =
        m.CompleteName ||
        `${m.FirstName || ""} ${m.LastName || ""}`.trim() ||
        memberId;

      const statusRow = statusByMember.get(memberId);
      let completion = String(statusRow?.CompletionStatus || "NO").toUpperCase();
      let updatedDate = statusRow?.UpdatedDate || "";

      const tr = document.createElement("tr");
      tr.dataset.memberId = memberId;

      // Member name
      const tdName = document.createElement("td");
      tdName.textContent = fullName;
      tr.appendChild(tdName);

      // Status dropdown
      const tdStatus = document.createElement("td");
      const select = document.createElement("select");

      const optReading = document.createElement("option");
      optReading.value = "NO";
      optReading.textContent = "Reading...";
      select.appendChild(optReading);

      const optCompleted = document.createElement("option");
      optCompleted.value = "YES";
      optCompleted.textContent = "Completed";
      select.appendChild(optCompleted);

      select.value = completion === "YES" ? "YES" : "NO";
      tdStatus.appendChild(select);
      tr.appendChild(tdStatus);

      // Date (only if completed)
      const tdDate = document.createElement("td");
      tdDate.textContent = (select.value === "YES") ? (updatedDate || "") : "";
      tr.appendChild(tdDate);

      // Render-only toggle (no saving yet)
      select.addEventListener("change", () => {
        completion = select.value;
        if (completion === "YES") {
          if (!updatedDate) updatedDate = formatTodayMDY();
          tdDate.textContent = updatedDate;
        } else {
          tdDate.textContent = "";
        }
      });

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="3">Error loading member status.</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadDashboard();
  await loadMemberStatusTable();
});
async function saveCheckpointStatuses() {
  const msgEl = document.getElementById("saveMessage");
  try {
    if (!currentCheckpointId) {
      msgEl.textContent = "No current checkpoint to save.";
      return;
    }

    msgEl.textContent = "Saving...";

    // Build updates from table rows
    const rows = document.querySelectorAll("#memberStatusBody tr");
    const updates = Array.from(rows).map(tr => {
      const memberId = tr.dataset.memberId;

      const select = tr.querySelector("select");
      const completionStatus = select?.value || "NO"; // YES/NO

      const dateText = tr.children[2]?.textContent?.trim() || "";
      const updatedDate = (completionStatus === "YES") ? dateText : "";

      return { memberId, completionStatus, updatedDate };
    });

    const res = await fetch("/api/checkpoint-status/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkpointId: currentCheckpointId,
        updates
      })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const result = await res.json();

    msgEl.textContent = `Saved! Updated: ${result.updated}, Added: ${result.added}`;

    // Optional: clear message after a few seconds
    setTimeout(() => { msgEl.textContent = ""; }, 3000);

  } catch (err) {
    console.error(err);
    msgEl.textContent = "Save failed...";
  }
}

saveChangesBtn?.addEventListener("click", saveCheckpointStatuses);
