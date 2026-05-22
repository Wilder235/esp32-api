import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";

const app = express();

const pagamentos = {};
const filaLiberacao = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log(
  "TOKEN carregado?",
  process.env.MP_ACCESS_TOKEN ? "SIM" : "NÃO"
);

// ============================
// TESTE API
// ============================
app.get("/", (req, res) => {
  res.send("API rodando OK");
});

// ============================
// TESTE WEBHOOK
// ============================
app.get("/webhook", (req, res) => {
  res.send("Webhook OK");
});

// ============================
// PAGAMENTO APROVADO
// ============================
app.get("/pago", (req, res) => {

  res.send(`
    <html>
      <body style="
        font-family: Arial;
        text-align: center;
        padding-top: 80px;
        background: #f5f5f5;
      ">

        <h1 style="color: green;">
          ✅ PAGAMENTO APROVADO
        </h1>

        <h2>
          Seu produto será liberado.
        </h2>

      </body>
    </html>
  `);

});

// ============================
// PAGAMENTO PENDENTE
// ============================
app.get("/pendente", (req, res) => {

  res.send(`
    <html>
      <body style="
        font-family: Arial;
        text-align: center;
        padding-top: 80px;
        background: #f5f5f5;
      ">

        <h1 style="color: orange;">
          ⌛ PAGAMENTO PENDENTE
        </h1>

      </body>
    </html>
  `);

});

// ============================
// PAGAMENTO ERRO
// ============================
app.get("/erro", (req, res) => {

  res.send(`
    <html>
      <body style="
        font-family: Arial;
        text-align: center;
        padding-top: 80px;
        background: #f5f5f5;
      ">

        <h1 style="color: red;">
          ❌ PAGAMENTO NÃO APROVADO
        </h1>

      </body>
    </html>
  `);

});

// ============================
// CRIAR PAGAMENTO
// ============================
app.post("/criar-pagamento", async (req, res) => {

  try {

    const { valor } = req.body;

    const internalId = "esp32-" + Date.now();

    pagamentos[internalId] = {
      status: "pendente",
      valor: Number(valor),
      criadoEm: new Date().toISOString()
    };

    const preference = {

      items: [
        {
          title: "Produto ESP32",
          quantity: 1,
          unit_price: Number(valor)
        }
      ],

      external_reference: internalId,

      notification_url:
        "https://esp32-api-production.up.railway.app/webhook",

      back_urls: {

        success:
          "https://antidote-emphases-widen.ngrok-free.dev/pago",

        failure:
          "https://antidote-emphases-widen.ngrok-free.dev/erro",

        pending:
          "https://antidote-emphases-widen.ngrok-free.dev/pendente"
      },

      auto_return: "approved"
    };

    console.log("========== PREFERENCE ==========");
    console.log(JSON.stringify(preference, null, 2));
    console.log("================================");

    const response = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      preference,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    console.log("PAGAMENTO CRIADO:", internalId);

    res.json({
      internal_id: internalId,
      id: response.data.id,
      link: response.data.init_point
    });

  } catch (err) {

    console.log(
      "ERRO AO CRIAR PAGAMENTO:"
    );

    console.log(
      err.response?.data || err.message
    );

    res.status(500).json(
      err.response?.data || { erro: err.message }
    );
  }
});

// ============================
// WEBHOOK
// ============================
app.post("/webhook", async (req, res) => {

  try {

    console.log("");
    console.log("=========== WEBHOOK RECEBIDO ===========");

    const paymentId =
      req.body?.data?.id ||
      req.query?.id ||
      req.body?.id;

    console.log("PAYMENT ID:", paymentId);

    if (!paymentId) {
      return res.sendStatus(200);
    }

    // ignora merchant_order
    if (req.body?.topic === "merchant_order") {
      console.log("IGNORANDO merchant_order");
      return res.sendStatus(200);
    }

    const result = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const payment = result.data;

    console.log("STATUS:", payment.status);

    const internalId = payment.external_reference;

    if (!internalId) {
      console.log("SEM EXTERNAL_REFERENCE");
      return res.sendStatus(200);
    }

    // evita dupla entrega
    if (pagamentos[internalId]?.status === "entregue") {

      console.log("JÁ ENTREGUE");

      return res.sendStatus(200);
    }

    if (payment.status === "approved") {

      pagamentos[internalId] = {
        status: "pago",
        paymentId,
        pagoEm: new Date().toISOString()
      };

      filaLiberacao[internalId] = {
        liberar: true,
        timestamp: Date.now()
      };

      console.log("");
      console.log("🚀 PAGAMENTO APROVADO");
      console.log("LIBERADO:", internalId);
      console.log("");
    }

    return res.sendStatus(200);

  } catch (err) {

    console.log("");
    console.log("=========== ERRO WEBHOOK ===========");

    console.log(
      err.response?.data || err.message
    );

    console.log("====================================");
    console.log("");

    return res.sendStatus(200);
  }
});

// ============================
// ESP32 CONSULTA LIBERAÇÃO
// ============================
app.get("/liberar/:id", (req, res) => {

  const id = req.params.id;

  const item = filaLiberacao[id];

  if (!item) {

    return res.json({
      liberar: false
    });
  }

  delete filaLiberacao[id];

  pagamentos[id] = {
    ...pagamentos[id],
    status: "entregue",
    entregueEm: new Date().toISOString()
  };

  console.log("🚀 PRODUTO LIBERADO:", id);

  return res.json({
    liberar: true
  });
});

// ============================
// CONSULTAR STATUS
// ============================
app.get("/status/:id", (req, res) => {

  const id = req.params.id;

  return res.json(
    pagamentos[id] || {
      status: "não encontrado"
    }
  );
});

// ============================
// START
// ============================
app.listen(3000, () => {

  console.log("");
  console.log("================================");
  console.log("Rodando na porta 3000");
  console.log("================================");
  console.log("");

});