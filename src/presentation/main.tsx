import { createRoot } from "react-dom/client";
import { Root } from "@presentation/Root";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("missing #root element");
}

createRoot(container).render(<Root />);
