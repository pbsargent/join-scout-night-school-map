import React from "react";
import ReactDOM from "react-dom/client";
import { MapExplorer } from "../app/MapExplorer";
import "../app/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MapExplorer />
  </React.StrictMode>,
);
