const serverless = require("serverless-http");
const app = require("../index");

// Export the serverless-wrapped handler
module.exports = serverless(app);
