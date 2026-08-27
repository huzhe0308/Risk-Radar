// ai.yaml is gitignored for local development. On Vercel (or any CI) the file
// is absent, so import.meta.glob returns {} and we transparently fall back to
// the committed ai.example.yaml.
const aiYaml = import.meta.glob("../config/ai.yaml", { query: "?raw", import: "default", eager: true });
const exampleYaml = import.meta.glob("../config/ai.example.yaml", { query: "?raw", import: "default", eager: true });

export const aiConfigSource: string =
  (Object.values(aiYaml)[0] as string | undefined) ||
  (Object.values(exampleYaml)[0] as string | undefined) ||
  "";
