import React from "react";
import ReactDOM from "react-dom/client";
import { ColorModeProvider } from "./theme/ColorModeContext";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorModeProvider>
      <App />
    </ColorModeProvider>
  </React.StrictMode>
);
