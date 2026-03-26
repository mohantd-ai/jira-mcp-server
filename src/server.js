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
   SSE CONNECTION HANDLING
========================= */

const transports = new Map();

/* SSE endpoint */
app.get("/sse", async (req, res) => {
  try {
    console.log("✅ SSE connected");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (res.flushHeaders) res.flushHeaders();

    // ✅ IMPORTANT: Initial handshake event
    res.write(`event: ready\n`);
    res.write(`data: connected\n\n`);

    const transport = new SSEServerTransport("/messages", res);

    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    req.on("close", () => {
      console.log("❌ SSE disconnected");
      transports.delete(sessionId);
    });

    await server.connect(transport);

  } catch (err) {
    console.error("❌ SSE error:", err);
    res.end();
  }
});

/* MCP message handler */
app.post("/messages", async (req, res) => {
  try {
    const sessionId = req.query.sessionId;

    const transport = transports.get(sessionId);

    if (!transport) {
      return res.status(400).send("Invalid session");
    }

    await transport.handlePostMessage(req, res);

  } catch (err) {
    console.error("❌ Message error:", err);
    res.status(500).end();
  }
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 MCP Jira Server running on port ${PORT}`);
});
