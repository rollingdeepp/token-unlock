import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { config } from "./wagmi";
import { App } from "./App";
import { Landing } from "./Landing";
import "./index.css";

const queryClient = new QueryClient();
const fluxTheme = darkTheme({ accentColor: "#FF3FA4", accentColorForeground: "#1A0B2E", borderRadius: "small", fontStack: "system" });

function Root() {
  const [entered, setEntered] = useState(false);
  if (!entered) return <Landing onEnter={() => setEntered(true)} />;
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={fluxTheme}><App onHome={() => setEntered(false)} /></RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
