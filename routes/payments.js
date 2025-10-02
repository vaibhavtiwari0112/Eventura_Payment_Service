const express = require("express");
const router = express.Router();
const paymentController = require("../controller/payment");

// Create order
router.post("/create-order", paymentController.createOrder);

// Verify payment
router.post("/verify", paymentController.verifyPayment);

module.exports = router;
