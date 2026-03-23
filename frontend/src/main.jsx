import React from "react";
import ReactDOM from "react-dom/client";
import { configure } from "axios-hooks";
import api from "./services/api";
import { ColorModeProvider } from "./theme/ColorModeContext";
import LiffProvider from "./context/LiffProvider";
import App from "./App";
import "./index.css";

configure({ axios: api });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorModeProvider>
      <LiffProvider>
        <App />
      </LiffProvider>
    </ColorModeProvider>
  </React.StrictMode>
);
