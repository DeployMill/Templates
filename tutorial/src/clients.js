// Per-client connection instructions for the "Connect DeployMill to your agent"
// lesson. Add your client here if it's missing — `command` renders as a shell
// snippet, `config` renders as a JSON block, and a client can have either or
// both. `{{MCP_URL}}` is replaced with this workspace's real endpoint.

export const CLIENTS = [
  {
    id: "claude-code",
    label: "Claude Code",
    command: "claude mcp add --transport http deploymill {{MCP_URL}}",
    after: "Then run /mcp inside Claude Code and pick deploymill to sign in.",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    after:
      "Settings → Connectors → Add custom connector, paste the URL, then sign in when the browser opens.",
    config: {
      mcpServers: {
        deploymill: { type: "http", url: "{{MCP_URL}}" },
      },
    },
  },
  {
    id: "cursor",
    label: "Cursor",
    after: "Settings → MCP → Add new server, or drop this into .cursor/mcp.json.",
    config: {
      mcpServers: {
        deploymill: { url: "{{MCP_URL}}" },
      },
    },
  },
  {
    id: "vscode",
    label: "VS Code",
    command: "code --add-mcp '{\"name\":\"deploymill\",\"type\":\"http\",\"url\":\"{{MCP_URL}}\"}'",
    after: "Or add it by hand in .vscode/mcp.json.",
  },
  {
    id: "other",
    label: "Anything else",
    after:
      "Any MCP client that speaks Streamable HTTP works. Point it at the URL below; it'll walk you through OAuth on first use.",
    command: "{{MCP_URL}}",
  },
];

/** Fill a client's snippets with this workspace's real MCP endpoint. */
export function resolveClients(mcpUrl) {
  return CLIENTS.map((client) => ({
    ...client,
    command: client.command ? client.command.replaceAll("{{MCP_URL}}", mcpUrl) : null,
    config: client.config
      ? JSON.stringify(client.config, null, 2).replaceAll("{{MCP_URL}}", mcpUrl)
      : null,
  }));
}
