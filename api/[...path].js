// Entry serverless do Vercel.
// Reaproveita o app Express do backend (mesmas rotas /api/*) como uma única
// Serverless Function catch-all. O Vercel roteia qualquer /api/... para cá.
const { createApp } = require("../backend/src/app");

const app = createApp();

module.exports = (req, res) => app(req, res);
