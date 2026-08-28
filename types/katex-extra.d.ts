declare module "katex/contrib/auto-render" {
  const renderMathInElement: (
    element: HTMLElement,
    options?: {
      delimiters?: Array<{ left: string; right: string; display: boolean }>;
      throwOnError?: boolean;
      strict?: boolean | string;
      ignoredTags?: string[];
    },
  ) => void;
  export default renderMathInElement;
}

declare module "katex/dist/katex.min.css";
