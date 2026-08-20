declare module "*.yaml?raw" {
  const source: string;
  export default source;
}

declare module "js-yaml" {
  export function load(source: string): unknown;
}

