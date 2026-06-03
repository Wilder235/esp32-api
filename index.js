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
// TERMINAIS
// ============================
app.get("/terminals", async (req, res) => {

  try {

    const pos = await axios.get(
      "https://api.mercadopago.com/pos",
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const devices = await axios.get(
      "https://api.mercadopago.com/point/integration-api/devices",
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const resultado = {
      pos: pos.data,
      devices: devices.data
    };

    console.log("TERMINAIS:");
    console.log(JSON.stringify(resultado, null, 2));

    res.json(resultado);

  } catch (err) {

    console.log("ERRO TERMINAIS:");
    console.log(err.response?.data || err.message);

    res.status(500).json(
      err.response?.data || err.message
    );
  }
});

// ============================
// WEBHOOK TESTE
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
// DEVICE STATUS
// ============================
app.get("/device-status", async (req, res) => {

  try {

    const response = await axios.get(
      "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032",
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    console.log("DEVICE STATUS:");
    console.log(JSON.stringify(response.data, null, 2));

    res.json(response.data);

  } catch (err) {

    console.log("ERRO DEVICE:");
    console.log(err.response?.data || err.message);

    res.status(500).json(
      err.response?.data || err.message
    );
  }
});

// ============================
// POINT PAGAMENTO
// ============================
app.post("/point-pagamento", async (req, res) => {

  try {

    const { valor } = req.body;

    const response = await axios.post(
      "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032/payment-intents",

      {
        amount: Math.round(Number(valor) * 100),

        description: "Venda ESP32",

        payment: {
          installments: 1,
          type: "credit_card"
        }
      },

      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("POINT PAGAMENTO:");
    console.log(JSON.stringify(response.data, null, 2));

    res.json(response.data);

  } catch (err) {

    console.log("ERRO POINT:");
    console.log(err.response?.data || err.message);

    res.status(500).json(
      err.response?.data || err.message
    );
  }
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
        "https://esp32-api-production-9fa8.up.railway.app/webhook",

      back_urls: {

        success:
          "https://esp32-api-production-9fa8.up.railway.app/pago",

        failure:
          "https://esp32-api-production-9fa8.up.railway.app/erro",

        pending:
          "https://esp32-api-production-9fa8.up.railway.app/pendente"
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

    console.log("ERRO AO CRIAR PAGAMENTO:");

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

    console.log("MERCHANT ORDER ID:", payment.order?.id);
    console.log("PAYMENT ID:", payment.id);
    console.log("STATUS:", payment.status);

    const internalId = payment.external_reference;

    if (!internalId) {
      console.log("SEM EXTERNAL_REFERENCE");
      return res.sendStatus(200);
    }

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
// LIBERAR PRODUTO
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
