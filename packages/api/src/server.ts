import app from "./index";

const port = parseInt(process.env.API_URL?.split(":").pop() ?? "4001", 10);

console.log(`ErrorDecoder API running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
