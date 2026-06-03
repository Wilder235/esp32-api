import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import crypto from "crypto";

const app = express();

const pagamentos = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log(
  "TOKEN carregado?",
  process.env.MP_ACCESS_TOKEN ? "SIM" : "NÃO"
);

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {

  res.send("API rodando OK");
});

// ======================================================
// CRIAR PAGAMENTO
// ======================================================

app.post("/criar-pagamento", async (req, res) => {

  try {

    const { valor } = req.body;

    const internalId =
      "esp32-" + Date.now();

    pagamentos[internalId] = {

      status: "pendente",

      valor:
        Number(valor),

      criadoEm:
        new Date().toISOString()
    };

    // ==================================================
    // ABRIR POINT
    // MENU:
    // CRÉDITO / DÉBITO
    // ==================================================

    setTimeout(async () => {

      try {

        const pointResponse =
          await axios.post(

            "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032/payment-intents",

            {
              amount:
                Math.round(
                  Number(valor) * 100
                ),

              description:
                "Venda ESP32"
            },

            {
              headers: {

                Authorization:
                  `Bearer ${process.env.MP_ACCESS_TOKEN}`,

                "Content-Type":
                  "application/json"
              },

              timeout: 10000
            }
          );

        console.log("");
        console.log("================================");
        console.log("POINT ABERTA");
        console.log("================================");

        console.log(
          JSON.stringify(
            pointResponse.data,
            null,
            2
          )
        );

      } catch (err) {

        console.log("");
        console.log("ERRO POINT");

        console.log(
          err.response?.data ||
          err.message
        );
      }

    }, 100);

    // ==================================================
    // PIX EXTERNO
    // ==================================================

    const idempotencyKey =
      crypto.randomUUID();

    const pixResponse =
      await axios.post(

        "https://api.mercadopago.com/v1/payments",

        {
          transaction_amount:
            Number(valor),

          description:
            "Produto ESP32",

          payment_method_id:
            "pix",

          external_reference:
            internalId,

          payer: {
            email:
              "comprador@email.com"
          }
        },

        {
          headers: {

            Authorization:
              `Bearer ${process.env.MP_ACCESS_TOKEN}`,

            "Content-Type":
              "application/json",

            "X-Idempotency-Key":
              idempotencyKey
          },

          timeout: 10000
        }
      );

    const pagamento =
      pixResponse.data;

    console.log("");
    console.log("================================");
    console.log("PIX GERADO");
    console.log("================================");

    console.log(
      JSON.stringify(
        pagamento,
        null,
        2
      )
    );

    // ==================================================
    // RETORNO
    // ==================================================

    return res.json({

      internal_id:
        internalId,

      status:
        pagamento.status,

      payment_id:
        pagamento.id,

      qr_code:
        pagamento
          .point_of_interaction
          ?.transaction_data
          ?.qr_code,

      qr_code_base64:
        pagamento
          .point_of_interaction
          ?.transaction_data
          ?.qr_code_base64,

      ticket_url:
        pagamento
          .point_of_interaction
          ?.transaction_data
          ?.ticket_url
    });

  } catch (err) {

    console.log("");
    console.log("ERRO PAGAMENTO");

    console.log(
      err.response?.data ||
      err.message
    );

    return res.status(500).json(

      err.response?.data || {

        erro:
          err.message
      }
    );
  }
});

// ======================================================
// STATUS
// ======================================================

app.get("/status/:id", (req, res) => {

  const id =
    req.params.id;

  return res.json(

    pagamentos[id] || {

      status:
        "não encontrado"
    }
  );
});

// ======================================================
// START
// ======================================================

app.listen(3000, () => {

  console.log("");
  console.log("================================");
  console.log("Rodando na porta 3000");
  console.log("================================");
  console.log("");
});
