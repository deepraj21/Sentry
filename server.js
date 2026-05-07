import { app } from "./api/index.js";

const port = Number.parseInt(process.env.PORT || "4020", 10);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Sentry running at http://localhost:${port}`);
});

