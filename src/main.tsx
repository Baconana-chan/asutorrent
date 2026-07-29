import { render } from "preact";
import { App } from "./app";

// ── CSS modules ──────────────────────────────────────────────────
import "./styles/variables.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/torrent-table.css";
import "./styles/detail-panel.css";
import "./styles/dialogs.css";
import "./styles/components.css";

render(<App />, document.getElementById("app")!);
