import app from "./index";

const port = parseInt(process.env.APP_URL?.split(":").pop() ?? "5000", 10);

console.log(`ErrorDecoder API running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
