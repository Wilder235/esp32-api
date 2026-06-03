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

    const { valor, metodo } = req.body;

    const internalId =
      "esp32-" + Date.now();

    pagamentos[internalId] = {

      status: "pendente",

      valor: Number(valor),

      metodo,

      criadoEm:
        new Date().toISOString()
    };

    // ==================================================
    // PIX
    // ==================================================

    if (metodo === "pix") {

      // ===============================================
      // TENTAR ABRIR PIX NA POINT
      // ===============================================

      setTimeout(async () => {

        try {

          const pointPixResponse =
            await axios.post(

              "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032/payment-intents",

              {
                amount:
                  Math.round(
                    Number(valor) * 100
                  ),

                description:
                  "Venda ESP32 PIX",

                payment_mode: "qr"
              },

              {
                headers: {

                  Authorization:
                    `Bearer ${process.env.MP_ACCESS_TOKEN}`,

                  "Content-Type":
                    "application/json"
                },

                timeout: 5000
              }
            );

          console.log("");
          console.log("POINT PIX OK");

          console.log(
            JSON.stringify(
              pointPixResponse.data,
              null,
              2
            )
          );

        } catch (err) {

          console.log("");
          console.log("POINT PIX FALHOU");

          console.log(
            err.response?.data ||
            err.message
          );
        }

      }, 100);

      // ===============================================
      // PIX EXTERNO REAL
      // ===============================================

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

      return res.json({

        internal_id:
          internalId,

        metodo:
          "pix",

        payment_id:
          pagamento.id,

        status:
          pagamento.status,

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
    }

    // ==================================================
    // CRÉDITO
    // ==================================================

    if (metodo === "credito") {

      const pointResponse =
        await axios.post(

          "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032/payment-intents",

          {
            amount:
              Math.round(
                Number(valor) * 100
              ),

            description:
              "Venda ESP32 Crédito",

            payment: {

              installments: 1,

              type:
                "credit_card"
            }
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

      return res.json({

        internal_id:
          internalId,

        metodo:
          "credito",

        status:
          "point_aberta",

        point_response:
          pointResponse.data
      });
    }

    // ==================================================
    // DÉBITO
    // ==================================================

    if (metodo === "debito") {

      const pointResponse =
        await axios.post(

          "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032/payment-intents",

          {
            amount:
              Math.round(
                Number(valor) * 100
              ),

            description:
              "Venda ESP32 Débito",

            payment: {
              type:
                "debit_card"
            }
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

      return res.json({

        internal_id:
          internalId,

        metodo:
          "debito",

        status:
          "point_aberta",

        point_response:
          pointResponse.data
      });
    }

    // ==================================================
    // MÉTODO INVÁLIDO
    // ==================================================

    return res.status(400).json({

      erro:
        "Método inválido"
    });

  } catch (err) {

    console.log("");
    console.log("ERRO PAGAMENTO:");

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






// ======================================================
// TESTE POINT
// ======================================================

app.post("/teste-point", async (req, res) => {

  try {

    const { valor, modo } = req.body;

    let payload = {

      amount:
        Math.round(Number(valor) * 100),

      description:
        "Teste Point"
    };

    // ==============================================
    // MODO 1
    // ==============================================

    if (modo == 1) {

      payload.payment = {
        type: "card"
      };
    }

    // ==============================================
    // MODO 2
    // ==============================================

    if (modo == 2) {

      payload.payment_mode = "qr";
    }

    // ==============================================
    // MODO 3
    // ==============================================

    if (modo == 3) {

      payload.payment = {
        type: "qr"
      };
    }

    // ==============================================
    // MODO 4
    // ==============================================

    if (modo == 4) {

      // sem payment
    }

    // ==============================================
    // MODO 5
    // ==============================================

    if (modo == 5) {

      payload.payment_method_id = "pix";
    }

    console.log("");
    console.log("================================");
    console.log("TESTE POINT");
    console.log("================================");

    console.log(
      JSON.stringify(payload, null, 2)
    );

    const response =
      await axios.post(

        "https://api.mercadopago.com/point/integration-api/devices/NEWLAND_N950__N950NCD300351032/payment-intents",

        payload,

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

    return res.json({

      sucesso: true,

      modo,

      payload,

      resposta:
        response.data
    });

  } catch (err) {

    console.log("");
    console.log("ERRO TESTE POINT");

    console.log(
      err.response?.data ||
      err.message
    );

    return res.status(500).json({

      erro:
        err.response?.data ||
        err.message
    });
  }
});








app.listen(3000, () => {

  console.log("");
  console.log("================================");
  console.log("Rodando na porta 3000");
  console.log("================================");
  console.log("");
});
