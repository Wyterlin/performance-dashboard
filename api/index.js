// Entry serverless do Vercel (Serverless Function única para todo /api).
// Reaproveita o app Express do backend. O roteamento de /api/* para cá é feito
// pelo rewrite no vercel.json. Nome sem colchetes para evitar problemas de
// detecção no Git/Vercel.
const { createApp } = require("../backend/src/app");

const app = createApp();

// O Vercel entrega o caminho original em req.url (ex.: /api/tickets/summary).
// A malha de segurança abaixo garante o prefixo /api caso a plataforma
// eventualmente entregue o caminho sem ele.
module.exports = (req, res) => {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url === "/" ? "" : req.url);
  }
  return app(req, res);
};
