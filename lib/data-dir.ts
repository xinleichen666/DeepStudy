import path from "path";

export function dataDir() {
  return process.env.DEEPSTUDY_DATA_DIR || path.join(process.cwd(), "data");
}
