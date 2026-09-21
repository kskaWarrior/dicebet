import { criarApp } from "./app.js";
import { env } from "./shared/env.js";

criarApp().listen(env.port, "0.0.0.0", () => {
  console.log(`DiceBet API listening on :${env.port}`);
});
