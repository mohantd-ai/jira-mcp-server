const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const key = req.headers["x-api-key"];
  if (key !== process.env.API_KEY) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
});

const jira = axios.create({
  baseURL: process.env.JIRA_BASE_URL,
  auth: {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN
  }
});

app.get("/", (req, res) => {
  res.send("Jira MCP running");
});

app.get("/issues", async (req, res) => {
  const response = await jira.get("/rest/api/3/search");
  res.json(response.data);
});

app.post("/issue", async (req, res) => {
  const { projectKey, summary } = req.body;

  const response = await jira.post("/rest/api/3/issue", {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: "Task" }
    }
  });

  res.json(response.data);
});

app.listen(process.env.PORT || 3000);
