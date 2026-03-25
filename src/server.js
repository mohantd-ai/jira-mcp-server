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

// ✅ Create MCP server
const server = new Server(
  {
    name: "jira-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// 🔍 Tool: Search Issues
server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "searchIssues",
        description: "Search Jira issues using JQL",
        inputSchema: {
          type: "object",
          properties: {
            jql: { type: "string" }
          }
        }
      },
      {
        name: "createIssue",
        description: "Create Jira issue",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string" },
            summary: { type: "string" }
          }
        }
      }
    ]
  };
});

// 🧠 Tool execution
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "searchIssues") {
    const res = await jira.get("/rest/api/3/search", {
      params: { jql: args.jql || "ORDER BY created DESC" }
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

  if (name === "createIssue") {
    const res = await jira.post("/rest/api/3/issue", {
      fields: {
        project: { key: args.projectKey },
        summary: args.summary,
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

  throw new Error("Unknown tool");
});

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
