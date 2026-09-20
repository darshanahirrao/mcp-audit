import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@darsh/design/tokens.css";
import "@darsh/design/base.css";
import "@darsh/design/components.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "mcp-audit: audit an MCP server before you connect it",
  description:
    "Tool poisoning, credential exposure, exfiltration surface and scope creep in MCP servers. Scored per tool, in your browser.",
  metadataBase: new URL("https://mcp-audit-three.vercel.app"),
  openGraph: {
    title: "mcp-audit",
    description: "Audit an MCP server before you connect it. Runs in your browser.",
    url: "https://mcp-audit-three.vercel.app",
    siteName: "Darshan Ahirrao",
    type: "website",
  },
  icons: { icon: "/icon.svg" },
};

const themeScript = `(function(){try{var s=localStorage.getItem("mcp-audit-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=s||(d?"dark":"light");}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
