import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

dotenv.config();

const app = express();

// Jira client
const jira = axios.create({
  baseURL: process.env.JIRA_BASE_URL,
  auth: {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN
  }
});

// ✅ MCP Server
const server = new Server({
  name: "jira-mcp",
  version: "1.0.0"
});


// 🔍 Tool: Search Issues
server.tool(
  "searchIssues",
  {
    jql: "string"
  },
  async ({ jql }) => {
    const res = await jira.get("/rest/api/3/search", {
      params: { jql: jql || "ORDER BY created DESC" }
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(res.data.issues.slice(0, 5), null, 2)
        }
      ]
    };
  }
);


// 📝 Tool: Create Issue
server.tool(
  "createIssue",
  {
    projectKey: "string",
    summary: "string"
  },
  async ({ projectKey, summary }) => {
    const res = await jira.post("/rest/api/3/issue", {
      fields: {
        project: { key: projectKey },
        summary,
        issuetype: { name: "Task" }
      }
    });

    return {
      content: [
        {
          type: "text",
          text: `Created issue: ${res.data.key}`
        }
      ]
    };
  }
);


// ✅ SSE endpoint
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

// Required endpoint
app.post("/messages", express.json(), async (req, res) => {
  res.status(200).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Jira Server running on port ${PORT}`);
});
