import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import crypto from "crypto";

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
// HOME
// ============================
app.get("/", (req, res) => {
  res.send("API rodando OK");
});

// ============================
// CRIAR PAGAMENTO
// POINT + PIX
// ============================
app.post("/criar-pagamento", async (req, res) => {

  try {

    const { valor } = req.body;

    // ===================================
    // POINT EM BACKGROUND
    // ===================================

    setTimeout(async () => {

      try {

        const pointResponse = await axios.post(

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
            },
            timeout: 5000
          }
        );

        console.log("POINT OK:");
        console.log(JSON.stringify(pointResponse.data, null, 2));

      } catch (err) {

        console.log("ERRO POINT:");
        console.log(err.response?.data || err.message);

      }

    }, 100);

    // ===================================
    // PIX DIRETO
    // ===================================

    const internalId = "esp32-" + Date.now();

    pagamentos[internalId] = {
      status: "pendente",
      valor: Number(valor),
      criadoEm: new Date().toISOString()
    };

    const idempotencyKey = crypto.randomUUID();

    const pixResponse = await axios.post(

      "https://api.mercadopago.com/v1/payments",

      {
        transaction_amount: Number(valor),

        description: "Produto ESP32",

        payment_method_id: "pix",

        external_reference: internalId,

        payer: {
          email: "comprador@email.com"
        }
      },

      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey
        },

        timeout: 10000
      }
    );

    const pagamento = pixResponse.data;

    console.log("PIX CRIADO:");
    console.log(JSON.stringify(pagamento, null, 2));

    return res.json({

      internal_id: internalId,

      payment_id: pagamento.id,

      status: pagamento.status,

      qr_code:
        pagamento.point_of_interaction
          ?.transaction_data
          ?.qr_code,

      qr_code_base64:
        pagamento.point_of_interaction
          ?.transaction_data
          ?.qr_code_base64,

      ticket_url:
        pagamento.point_of_interaction
          ?.transaction_data
          ?.ticket_url
    });

  } catch (err) {

    console.log("ERRO AO CRIAR PAGAMENTO:");

    console.log(
      err.response?.data || err.message
    );

    return res.status(500).json(
      err.response?.data || { erro: err.message }
    );
  }
});

// ============================
// WEBHOOK
// ============================
app.post("/webhook", async (req, res) => {

  try {

    const paymentId =
      req.body?.data?.id ||
      req.query?.id ||
      req.body?.id;

    if (!paymentId) {
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

    const internalId = payment.external_reference;

    if (!internalId) {
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

      console.log("🚀 PAGAMENTO APROVADO");
    }

    return res.sendStatus(200);

  } catch (err) {

    console.log(
      err.response?.data || err.message
    );

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
// START
// ============================
app.listen(3000, () => {

  console.log("");
  console.log("================================");
  console.log("Rodando na porta 3000");
  console.log("================================");
  console.log("");

});
