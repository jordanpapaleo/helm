// Mermaid is imported on first use so it stays out of the initial bundle.

type MermaidModule = typeof import("mermaid")["default"];

let loading: Promise<MermaidModule> | null = null;
let currentScheme: "light" | "dark" | null = null;
let renderCounter = 0;

async function load(scheme: "light" | "dark"): Promise<MermaidModule> {
  if (!loading) {
    loading = import("mermaid").then((m) => m.default);
  }
  const mermaid = await loading;
  if (currentScheme !== scheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: scheme === "dark" ? "dark" : "default",
      fontFamily: "inherit",
    });
    currentScheme = scheme;
  }
  return mermaid;
}

export async function renderMermaid(source: string, scheme: "light" | "dark"): Promise<string> {
  const mermaid = await load(scheme);
  const id = `helm-mermaid-${++renderCounter}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return svg;
  } catch (e) {
    // Mermaid leaves an error element in the DOM on failure.
    document.getElementById(`d${id}`)?.remove();
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}
