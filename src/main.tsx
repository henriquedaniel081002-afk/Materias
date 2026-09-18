import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { DataProvider } from "./context/DataContext";
import { registerPwaServiceWorker } from "./pwa";

registerPwaServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </React.StrictMode>,
);
