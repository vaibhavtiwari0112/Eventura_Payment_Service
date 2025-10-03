const express = require("express");
const router = express.Router();
const paymentController = require("../controller/payment");

// ✅ Create order endpoint
router.post("/create-order", async (req, res, next) => {
  try {
    await paymentController.createOrder(req, res);
  } catch (err) {
    next(err);
  }
});

// ✅ Verify payment endpoint
router.post("/verify", async (req, res, next) => {
  try {
    await paymentController.verifyPayment(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
