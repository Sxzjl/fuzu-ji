import "./style.css";
import { startApp } from "./app.ts";

const root = document.querySelector<HTMLElement>("#app");
if (root) startApp(root);
