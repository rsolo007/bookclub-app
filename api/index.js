const app = require("../server");

// Vercel expects a function handler:
module.exports = (req, res) => {
  return app(req, res);
};
