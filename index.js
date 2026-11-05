const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT) || 3000;
const app = express();
const archivePath = path.join(__dirname, "data", "deleted-cards.csv");
const archiveHeader = "timestamp,title,description,time_remaining_ms\n";

function escapeCsv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const archiveReady = fs.mkdir(path.dirname(archivePath), { recursive: true })
  .then(async () => {
    const file = await fs.open(archivePath, "a");
    try {
      if ((await file.stat()).size === 0) {
        await file.writeFile(archiveHeader);
      }
    } finally {
      await file.close();
    }
  });

app.use(express.json({ limit: "10kb" }));

app.post("/api/deleted-cards", async (request, response) => {
  const { title, description, timeRemainingMs } = request.body ?? {};
  if (
    typeof title !== "string"
    || !title.trim()
    || title.length > 100
    || typeof description !== "string"
    || description.length > 240
    || typeof timeRemainingMs !== "number"
    || !Number.isFinite(timeRemainingMs)
  ) {
    response.status(400).json({ error: "Invalid card data." });
    return;
  }

  const row = [
    new Date().toISOString(),
    title,
    description,
    timeRemainingMs,
  ].map(escapeCsv).join(",");

  try {
    await archiveReady;
    await fs.appendFile(archivePath, `${row}\n`, "utf8");
    response.status(201).json({ saved: true });
  } catch (error) {
    console.error("Failed to save deleted card:", error);
    response.status(500).json({ error: "Could not save deleted card." });
  }
});

app.use(express.static(path.join(__dirname, "views")));

app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, "views", "index.html"));
});

archiveReady
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize deleted-card archive:", error);
    process.exitCode = 1;
  });
