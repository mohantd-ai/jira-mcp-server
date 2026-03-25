import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

const app = express();
app.use(express.json());

/* =========================
   JIRA CLIENT
========================= */
const jira = axios.create({
  baseURL: process.env.JIRA_BASE_URL,
  auth: {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN
  },
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json"
  }
});

/* =========================
   MCP SERVER
========================= */
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

/* =========================
   LIST TOOLS
========================= */
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
        description: "Create a Jira issue",
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

/* =========================
   TOOL EXECUTION
========================= */
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    // 🔍 SEARCH ISSUES
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

    // 📝 CREATE ISSUE
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

  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err.response?.data || err.message}`
        }
      ]
    };
  }
});

/* =========================
   SSE ENDPOINT (FIXED)
========================= */
app.get("/sse", async (req, res) => {
  try {
    console.log("✅ SSE connection started");

    // Required headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // VERY IMPORTANT: send headers immediately
    if (res.flushHeaders) {
      res.flushHeaders();
    }

    const transport = new SSEServerTransport("/messages", res);

    await server.connect(transport);

  } catch (err) {
    console.error("❌ SSE error:", err);
    res.end();
  }
});

/* =========================
   MESSAGE ENDPOINT
========================= */
app.post("/messages", async (req, res) => {
  res.status(200).end();
});

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("Jira MCP Server Running");
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 MCP Jira Server running on port ${PORT}`);
});
