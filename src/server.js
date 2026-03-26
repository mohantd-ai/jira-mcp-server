import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
        description: "Search Jira issues",
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
          },
          required: ["projectKey", "summary"]
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

  if (name === "searchIssues") {
    const res = await jira.get("/rest/api/3/search", {
      params: { jql: args?.jql || "ORDER BY created DESC" }
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

/* =========================
   HTTP MCP ENDPOINT
========================= */
app.post("/mcp", async (req, res) => {
  try {
    const response = await server.handleRequest(req.body);
    res.json(response);
  } catch (err) {
    console.error("MCP error:", err);
    res.status(500).json({ error: err.message });
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
  console.log(`🚀 MCP HTTP Server running on port ${PORT}`);
});
